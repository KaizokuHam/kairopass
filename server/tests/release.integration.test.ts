import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Event, Reservation, PaymentAttempt, Ticket } from '../src/models/index.js';
import { useDisposableDatabase } from './helpers/database.js';
import { actor, eventInput, origin } from './helpers/events.js';
import { expireReservation } from '../src/modules/reservations/reservations.service.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

const database = useDisposableDatabase();
const app = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: {
  JWT_SECRET: randomBytes(48).toString('base64url'), TICKET_HMAC_SECRET: randomBytes(48).toString('base64url'), CLIENT_ORIGIN: origin
} });

/** Independent snapshot oracle: never fixes counters or relies on the HTTP DTO. */
async function inventory() {
  const session = await mongoose.connection.startSession();
  try {
    await session.withTransaction(async () => {
      for (const event of await Event.find().session(session)) {
        const occupied = await Reservation.countDocuments({ eventId: event._id, status: { $in: ['HELD', 'CONFIRMED'] } }).session(session);
        expect(event.reservedCount).toBe(occupied);
        expect(occupied).toBeGreaterThanOrEqual(0); expect(occupied).toBeLessThanOrEqual(event.capacity);
      }
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, timeoutMS: 8000 });
  } finally { await session.endSession(); }
}

describe('release acceptance across real HTTP and persisted MongoDB state', () => {
  it('preserves inventory at every lifecycle step, stable credentials, tenant privacy and exact reporting', async () => {
    const organizer = await actor(app), other = await actor(app, 'ORGANIZER', 'other@example.test');
    const attendee = await actor(app, 'ATTENDEE', 'attendee@example.test'), stranger = await actor(app, 'ATTENDEE', 'stranger@example.test');
    const organizerPath = '/api/organizer/events';
    async function create(pricePaise: number, title: string) {
      const response = await request(app).post(organizerPath).set('Cookie', organizer.cookie).set('Origin', origin).send({
        ...eventInput, title, pricePaise, capacity: 4, startAt: new Date(Date.now() + 1800000).toISOString(),
        endAt: new Date(Date.now() + 7200000).toISOString(), registrationDeadline: new Date(Date.now() + 900000).toISOString()
      }).expect(201); await inventory(); return response.body.data.event.id as string;
    }
    async function publish(id: string) {
      await request(app).post(`${organizerPath}/${id}/publish`).set('Cookie', organizer.cookie).set('Origin', origin).expect(200); await inventory();
    }
    async function hold(id: string) {
      const response = await request(app).post('/api/reservations').set('Cookie', attendee.cookie).set('Origin', origin).send({ eventId: id }).expect(201);
      await inventory(); return response.body.data.reservation.id as string;
    }
    async function pay(id: string, simulationOutcome: 'FAILURE' | 'SUCCESS', key: string) {
      const response = await request(app).post(`/api/reservations/${id}/payments`).set('Cookie', attendee.cookie).set('Origin', origin)
        .set('Idempotency-Key', key).send({ simulationOutcome }).expect(200); await inventory(); return response.body.data;
    }
    const id = await create(49900, 'Release acceptance paid');
    await request(app).get('/api/events/' + id).expect(404);
    await request(app).patch(`${organizerPath}/${id}`).set('Cookie', organizer.cookie).set('Origin', origin).send({ venue: 'Accessible test venue' }).expect(200); await inventory();
    await request(app).get(`${organizerPath}/${id}`).set('Cookie', other.cookie).expect(404);
    await publish(id);
    const discovery = await request(app).get('/api/events?q=Release&sort=price_asc&page=1&limit=1').expect(200);
    expect(discovery.body.data.events.map((event: { id: string }) => event.id)).toEqual([id]);
    await request(app).get('/api/events/' + id).expect(200);
    const reservationId = await hold(id), ticketPath = `/api/reservations/${reservationId}/ticket`;
    const repeated = await request(app).post('/api/reservations').set('Cookie', attendee.cookie).set('Origin', origin).send({ eventId: id }).expect(200);
    expect(repeated.body.data.reservation.id).toBe(reservationId); await inventory();
    await request(app).post(ticketPath).set('Cookie', attendee.cookie).set('Origin', origin).send({}).expect(409); await inventory();
    const failedKey = randomUUID(), failed = await pay(reservationId, 'FAILURE', failedKey);
    expect(failed.payment.status).toBe('FAILED'); expect(failed.reservation.status).toBe('HELD');
    expect((await pay(reservationId, 'FAILURE', failedKey)).payment.id).toBe(failed.payment.id);
    const key = randomUUID(), success = await pay(reservationId, 'SUCCESS', key);
    expect(success.reservation.status).toBe('CONFIRMED'); expect((await pay(reservationId, 'SUCCESS', key)).payment.id).toBe(success.payment.id);
    await request(app).get(`/api/reservations/${reservationId}`).set('Cookie', stranger.cookie).expect(404);
    await request(app).get(`/api/reservations/${reservationId}/payments`).set('Cookie', stranger.cookie).expect(404);
    await request(app).post(`${organizerPath}/${id}/cancel`).set('Cookie', organizer.cookie).set('Origin', origin).expect(409); await inventory();
    const issued = await request(app).post(ticketPath).set('Cookie', attendee.cookie).set('Origin', origin).send({}).expect(201); await inventory();
    const ticket = issued.body.data.ticket;
    const replay = await request(app).post(ticketPath).set('Cookie', attendee.cookie).set('Origin', origin).send({}).expect(200);
    expect(replay.body.data.ticket).toEqual(ticket); await inventory();
    await request(app).get('/api/tickets/' + ticket.id).set('Cookie', stranger.cookie).expect(404);
    await disconnectDatabase(); await connectDatabase(database.uri);
    const restored = await request(app).get('/api/tickets/' + ticket.id).set('Cookie', attendee.cookie).expect(200);
    expect(restored.body.data.ticket.qrPayload).toBe(ticket.qrPayload);
    const admission = `${organizerPath}/${id}/check-ins`;
    await request(app).post(admission).set('Cookie', other.cookie).set('Origin', origin).send({ qrPayload: ticket.qrPayload }).expect(404);
    await request(app).post(admission).set('Cookie', organizer.cookie).set('Origin', origin).send({ qrPayload: ticket.qrPayload.slice(0, -2) + 'xx' }).expect(400); await inventory();
    const used = await request(app).post(admission).set('Cookie', organizer.cookie).set('Origin', origin).send({ qrPayload: ticket.qrPayload }).expect(200); await inventory();
    const duplicate = await request(app).post(admission).set('Cookie', organizer.cookie).set('Origin', origin).send({ qrPayload: ticket.qrPayload }).expect(409); await inventory();
    expect(duplicate.body.error.details).toContainEqual({ field: 'checkedInAt', message: (await Ticket.findById(ticket.id))!.checkedInAt!.toISOString() });
    expect(used.body.success).toBe(true);
    const wallet = await request(app).get('/api/tickets/' + ticket.id).set('Cookie', attendee.cookie).expect(200);
    expect(wallet.body.data.ticket).toMatchObject({ status: 'USED', qrPayload: null, qrAvailable: false });
    expect((await request(app).get(admission).set('Cookie', organizer.cookie).expect(200)).body.data.pagination.total).toBe(1);
    const free = await create(0, 'Release acceptance free'); await publish(free);
    const freeReservation = await hold(free); expect((await pay(freeReservation, 'SUCCESS', randomUUID())).payment.amountPaise).toBe(0);
    const cancelled = await create(0, 'Release cancellation'); await publish(cancelled);
    const cancelledHold = await hold(cancelled);
    await request(app).post(`/api/reservations/${cancelledHold}/cancel`).set('Cookie', attendee.cookie).set('Origin', origin).expect(200); await inventory();
    const expiring = await hold(cancelled);
    // Controlled cutoff exercises the real expiration transaction without sleeping ten minutes.
    const expiry = (await Reservation.findById(expiring))!.expiresAt;
    expect(await expireReservation(expiring, expiry)).toBe(true); await inventory();
    expect(await expireReservation(expiring, expiry)).toBe(false); await inventory();
    await request(app).post(`${organizerPath}/${cancelled}/cancel`).set('Cookie', organizer.cookie).set('Origin', origin).expect(200); await inventory();
    await request(app).get('/api/events/' + cancelled).expect(404);
    const records = async () => Promise.all([Event, Reservation, PaymentAttempt, Ticket].map((model) => model.collection.find().sort({ _id: 1 }).toArray()));
    const before = await records();
    const report = await request(app).get('/api/organizer/analytics/overview?period=7d').set('Cookie', organizer.cookie).expect(200);
    expect(report.headers['cache-control']).toBe('no-store');
    expect(report.body.data.metrics.current).toMatchObject({ totalEvents: 3, occupiedCapacity: 2, confirmedBookings: 2, cancelledHolds: 1, expiredHolds: 1, ticketsUsed: 1, attendanceRate: 50 });
    expect(report.body.data.metrics.period).toMatchObject({ simulatedGrossRevenuePaise: '49900', successfulSimulatedPayments: 2, failedSimulatedPaymentAttempts: 1, checkIns: 1 });
    await request(app).get(`${organizerPath}/${id}/analytics`).set('Cookie', other.cookie).expect(404);
    expect(await records()).toEqual(before); expect(await PaymentAttempt.countDocuments()).toBe(3); expect(await Ticket.countDocuments()).toBe(1); await inventory();
    await request(app).post('/api/auth/logout').set('Cookie', attendee.cookie).set('Origin', origin).expect(200);
    await request(app).get('/api/tickets').set('Cookie', attendee.cookie).expect(401);
  });
});

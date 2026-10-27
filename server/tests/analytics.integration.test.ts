import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { Event, Reservation, PaymentAttempt, Ticket, User } from '../src/models/index.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { useDisposableDatabase } from './helpers/database.js';
import { actor, eventsApp, eventInput } from './helpers/events.js';
const database = useDisposableDatabase(), DAY = 86400000, now = Date.UTC(2026, 9, 27, 12);
const ago = (days: number) => new Date(now - days * DAY);
let app: ReturnType<typeof eventsApp>;
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); app = eventsApp(); });
afterEach(() => { vi.useRealTimers(); });
async function fixture() {
  const a = await actor(app), b = await actor(app, 'ORGANIZER', 'second@example.test'), attendee = await actor(app, 'ATTENDEE', 'attendee@example.test');
  async function event(owner: string, title: string, status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' = 'PUBLISHED', capacity = 10, reservedCount = 0, created = 50) {
    return Event.create({ ...eventInput, organizerId: owner, title, status, capacity, reservedCount, createdAt: ago(created), updatedAt: ago(created) });
  }
  const paid = await event(a.id, 'Paid performance', 'PUBLISHED', 10, 5), free = await event(a.id, 'Free performance', 'PUBLISHED', 4, 1, 5);
  const draft = await event(a.id, 'Draft history', 'DRAFT', 3, 0, 1), cancelled = await event(a.id, 'Cancelled past history', 'CANCELLED', 3, 0, 60);
  await Event.collection.updateOne({ _id: cancelled._id }, { $set: { startAt: ago(40), endAt: ago(39) } });
  const foreign = await event(b.id, 'Private second organizer', 'PUBLISHED', 99, 1);
  async function reservation(eventId: mongoose.Types.ObjectId, status: 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED', days: number, amountPaise = 49900, expiry = -1 / 24) {
    return Reservation.create({ eventId, userId: new mongoose.Types.ObjectId(), status, amountPaise, expiresAt: ago(expiry), createdAt: ago(days), updatedAt: ago(days) });
  }
  async function payment(reservationId: mongoose.Types.ObjectId, status: 'SUCCESS' | 'FAILED' | 'PENDING', amountPaise = 49900, created = 2, completed = 1) {
    return PaymentAttempt.create({ reservationId, transactionId: randomUUID(), idempotencyKey: randomUUID(), status, amountPaise,
      simulationOutcome: status === 'FAILED' ? 'FAILURE' : 'SUCCESS', ...(status === 'PENDING' ? {} : { completedAt: ago(completed) }), createdAt: ago(created), updatedAt: ago(completed) });
  }
  const first = await reservation(paid._id, 'CONFIRMED', 2), old = await reservation(paid._id, 'CONFIRMED', 40), unissued = await reservation(paid._id, 'CONFIRMED', 1);
  const active = await reservation(paid._id, 'HELD', 1 / 24), elapsed = await reservation(paid._id, 'HELD', 1, 49900, 1 / 1440);
  await reservation(paid._id, 'EXPIRED', 2); await reservation(paid._id, 'CANCELLED', 3);
  const zero = await reservation(free._id, 'CONFIRMED', 1, 0), other = await reservation(foreign._id, 'CONFIRMED', 1, 99999);
  await payment(first._id, 'FAILED'); const success = await payment(first._id, 'SUCCESS');
  await payment(old._id, 'FAILED', 49900, 39, 38); await payment(old._id, 'FAILED', 49900, 3, 2); await payment(old._id, 'SUCCESS', 49900, 3, 2);
  const successUnissued = await payment(unissued._id, 'SUCCESS', 49900, 1, 0.5);
  await payment(active._id, 'PENDING', 49900, 1 / 24); await payment(elapsed._id, 'PENDING', 49900, 1);
  await payment(zero._id, 'SUCCESS', 0, 1, 0.5); await payment(other._id, 'SUCCESS', 99999, 1, 0.5);
  const used = await Ticket.create({ reservationId: first._id, status: 'USED', checkedInAt: ago(1 / 24), createdAt: ago(1), updatedAt: ago(1 / 24) });
  await Ticket.create({ reservationId: old._id, createdAt: ago(2) }); await Ticket.create({ reservationId: zero._id, status: 'REVOKED', createdAt: ago(0.5) });
  await Ticket.create({ reservationId: other._id, status: 'USED', checkedInAt: ago(0.1) });
  return { a, b, attendee, paid, free, draft, cancelled, first, old, unissued, active, elapsed, success, successUnissued, used, payment };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const base = '/api/organizer/analytics/';
function overview(f: Fixture, query = '', cookie = f.a.cookie) { return request(app).get(base + 'overview' + query).set('Cookie', cookie); }
async function records() { return Promise.all([Event, Reservation, PaymentAttempt, Ticket].map((model) => model.collection.find({}).sort({ _id: 1 }).toArray())); }

describe('real organizer analytics accuracy and privacy', () => {
  it('reports a real paid failure/retry/replay/issuance/admission journey and a free checkout without double-counting', async () => {
    vi.useRealTimers();
    app = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: { JWT_SECRET: randomBytes(48).toString('base64url'), TICKET_HMAC_SECRET: randomBytes(48).toString('base64url'), CLIENT_ORIGIN: 'http://localhost:5173' } });
    const a = await actor(app), attendee = await actor(app, 'ATTENDEE', 'journey@example.test'), b = await actor(app, 'ORGANIZER', 'isolated@example.test');
    async function checkout(pricePaise: number) {
      const created = await request(app).post('/api/organizer/events').set('Cookie', a.cookie).set('Origin', 'http://localhost:5173').send({ ...eventInput, pricePaise, startAt: new Date(Date.now() + 1800000).toISOString(), endAt: new Date(Date.now() + 7200000).toISOString(), registrationDeadline: new Date(Date.now() + 600000).toISOString() }).expect(201);
      const eventId: string = created.body.data.event.id;
      await request(app).post(`/api/organizer/events/${eventId}/publish`).set('Cookie', a.cookie).set('Origin', 'http://localhost:5173').expect(200);
      const held = await request(app).post('/api/reservations').set('Cookie', attendee.cookie).set('Origin', 'http://localhost:5173').send({ eventId }).expect(201);
      const reservationId: string = held.body.data.reservation.id, path = `/api/reservations/${reservationId}/payments`;
      async function pay(outcome: string, key: string) { return request(app).post(path).set('Cookie', attendee.cookie).set('Origin', 'http://localhost:5173').set('Idempotency-Key', key).send({ simulationOutcome: outcome }).expect(200); }
      if (pricePaise) { const key = randomUUID(); const failed = await pay('FAILURE', key); await pay('FAILURE', key); expect(failed.body.data.payment.status).toBe('FAILED'); }
      const key = randomUUID(); await pay('SUCCESS', key); await pay('SUCCESS', key); return { eventId, reservationId };
    }
    const paid = await checkout(49900);
    const issued = await request(app).post(`/api/reservations/${paid.reservationId}/ticket`).set('Cookie', attendee.cookie).set('Origin', 'http://localhost:5173').send({}).expect(201);
    await request(app).post(`/api/organizer/events/${paid.eventId}/check-ins`).set('Cookie', a.cookie).set('Origin', 'http://localhost:5173').send({ qrPayload: issued.body.data.ticket.qrPayload }).expect(200);
    const path = base + 'overview?period=7d';
    const first = await request(app).get(path).set('Cookie', a.cookie).expect(200);
    expect(first.body.data.metrics.current).toMatchObject({ confirmedBookings: 1, ticketsCreated: 1, ticketsUsed: 1, attendanceRate: 100 });
    expect(first.body.data.metrics.period).toMatchObject({ simulatedGrossRevenuePaise: '49900', successfulSimulatedPayments: 1, failedSimulatedPaymentAttempts: 1, checkIns: 1, reservationConversionRate: 100 });
    await checkout(0); const before = await records();
    const second = await request(app).get(path).set('Cookie', a.cookie).expect(200);
    expect(second.body.data.metrics.current).toMatchObject({ confirmedBookings: 2, ticketsCreated: 1, ticketsUsed: 1, attendanceRate: 50 });
    expect(second.body.data.metrics.period).toMatchObject({ simulatedGrossRevenuePaise: '49900', successfulSimulatedPayments: 2, failedSimulatedPaymentAttempts: 1, reservationConversionRate: 100 });
    expect((await request(app).get(path).set('Cookie', b.cookie).expect(200)).body.data.metrics.current.totalEvents).toBe(0);
    await request(app).get(`/api/organizer/events/${paid.eventId}/analytics`).set('Cookie', b.cookie).expect(404);
    expect(await records()).toEqual(before); expect(await PaymentAttempt.countDocuments()).toBe(3);
  });
  it('reduces retries before joining bookings/tickets and exactly matches the independent fixture totals', async () => {
    const f = await fixture(), response = await overview(f).expect(200), { metrics, pagination, trends } = response.body.data;
    expect(metrics.current).toEqual({ totalEvents: 4, publishedEvents: 2, draftEvents: 1, cancelledEvents: 1, capacity: 20, occupiedCapacity: 6, remainingCapacity: 14, capacityUtilization: 30,
      totalReservations: 8, activeHolds: 1, elapsedHolds: 1, confirmedBookings: 4, expiredHolds: 1, cancelledHolds: 1, ticketsCreated: 3, ticketsIssued: 1, ticketsUsed: 1, ticketsRevoked: 1, attendanceRate: 25 });
    expect(metrics.period).toEqual({ eventsCreated: 2, reservationsCreated: 7, cohortConfirmed: 3, successfulSimulatedPayments: 4, failedSimulatedPaymentAttempts: 2, pendingSimulatedAttempts: 2,
      ticketsCreated: 3, checkIns: 1, simulatedGrossRevenuePaise: '149700', reservationConversionRate: 42.86 });
    expect(metrics.integrity).toEqual({ invalidSuccessReservations: 0, invalidTicketRecords: 0 }); expect(pagination.total).toBe(4); expect(trends).toHaveLength(30);
    for (const key of ['reservationsCreated', 'cohortConfirmed', 'successfulSimulatedPayments', 'checkIns']) expect(trends.reduce((n: number, point: Record<string, number>) => n + point[key]!, 0)).toBe(metrics.period[key]);
    expect(trends.reduce((n: bigint, point: { simulatedGrossRevenuePaise: string }) => n + BigInt(point.simulatedGrossRevenuePaise), 0n)).toBe(149700n);
    expect(response.headers['cache-control']).toBe('no-store'); expect(response.text).not.toMatch(/passwordHash|qrNonce|qrPayload|transactionId|idempotencyKey|@example\.test|Private second organizer/);
  });
  it('another organizer receives only their own totals and cannot drill into the first event', async () => {
    const f = await fixture(), other = await overview(f, '', f.b.cookie).expect(200);
    expect(other.body.data.metrics.current).toMatchObject({ totalEvents: 1, totalReservations: 1, confirmedBookings: 1, ticketsUsed: 1, attendanceRate: 100 });
    expect(other.body.data.metrics.period.simulatedGrossRevenuePaise).toBe('99999'); expect(other.text).not.toContain('Paid performance');
    await request(app).get(`/api/organizer/events/${f.paid.id}/analytics`).set('Cookie', f.b.cookie).expect(404);
    await overview(f, '?eventId=' + f.paid.id, f.b.cookie).expect(404);
  });
  it('empty organizers receive genuine zeros and null rates with no synthetic activity', async () => {
    const f = await fixture(), empty = await actor(app, 'ORGANIZER', 'empty@example.test'), { body } = await overview(f, '?period=all', empty.cookie).expect(200);
    expect(body.data.metrics.current.totalEvents).toBe(0); expect(body.data.metrics.current.attendanceRate).toBeNull(); expect(body.data.metrics.current.capacityUtilization).toBeNull();
    expect(body.data.metrics.period.reservationConversionRate).toBeNull(); expect(body.data.metrics.period.simulatedGrossRevenuePaise).toBe('0'); expect(body.data.events).toEqual([]);
    expect(body.data.trends.every((p: { reservationsCreated: number }) => p.reservationsCreated === 0)).toBe(true);
  });
  it.each(['paid', 'free', 'draft', 'cancelled'] as const)('owned %s event reports remain private and available independently of public visibility', async (key) => {
    const f = await fixture(), { body } = await request(app).get(`/api/organizer/events/${f[key].id}/analytics`).set('Cookie', f.a.cookie).expect(200);
    expect(body.data.events).toHaveLength(1); expect(body.data.events[0].id).toBe(f[key].id); expect(body.data.metrics.current.totalEvents).toBe(1);
    if (key === 'free') expect(body.data.metrics.period).toMatchObject({ successfulSimulatedPayments: 1, simulatedGrossRevenuePaise: '0' });
    if (key === 'draft') expect(body.data.metrics.period.reservationConversionRate).toBeNull();
  });
  it('period conversion keeps the creation cohort while payment and check-in activity use their own timestamps', async () => {
    const f = await fixture(), from = ago(1).toISOString(), to = new Date(now).toISOString();
    const { body } = await overview(f, '?' + new URLSearchParams({ from, to })).expect(200);
    expect(body.data.metrics.period).toMatchObject({ reservationsCreated: 4, cohortConfirmed: 2, reservationConversionRate: 50, successfulSimulatedPayments: 3, simulatedGrossRevenuePaise: '99800', checkIns: 1 });
    expect(body.data.metrics.current.confirmedBookings).toBe(4); expect(body.data.metrics.current.attendanceRate).toBe(25);
  });
  it.each(['7d', '30d', '90d', 'all'])('bounds and zero-fills chronological %s reporting', async (period) => {
    const f = await fixture(), { body } = await overview(f, '?period=' + period).expect(200), { trends, scope } = body.data;
    expect(trends.length).toBeGreaterThan(0); expect(trends.length).toBeLessThanOrEqual(90); expect(scope.timezone).toBe('UTC');
    expect(trends[0].from).toBe(scope.from); expect(trends.at(-1).to).toBe(scope.to);
    expect(trends.every((p: { from: string; to: string }, index: number) => Date.parse(p.to) > Date.parse(p.from) && (!index || p.from === trends[index - 1].to))).toBe(true);
    expect(trends.some((p: { reservationsCreated: number; simulatedGrossRevenuePaise: string }) => !p.reservationsCreated && p.simulatedGrossRevenuePaise === '0')).toBe(true);
  });
  it('uses inclusive from/exclusive to and normalizes explicit timezone offsets', async () => {
    const f = await fixture(), from = '2026-10-25T17:30:00+05:30', to = '2026-10-26T17:30:00+05:30';
    const { body } = await overview(f, '?' + new URLSearchParams({ from, to })).expect(200);
    expect(body.data.scope).toMatchObject({ from: ago(2).toISOString(), to: ago(1).toISOString() });
    expect(body.data.metrics.period).toMatchObject({ reservationsCreated: 2, cohortConfirmed: 1, successfulSimulatedPayments: 1, simulatedGrossRevenuePaise: '49900', checkIns: 0 });
  });
  it('returns bounded custom-range buckets instead of unbounded daily history', async () => {
    const f = await fixture(), { body } = await overview(f, '?' + new URLSearchParams({ from: ago(366).toISOString(), to: new Date(now).toISOString() })).expect(200);
    expect(body.data.scope.bucketDays).toBe(5); expect(body.data.trends).toHaveLength(74);
  });
  it('all-time includes old failed attempts and old reservation cohorts without counting retries as bookings', async () => {
    const f = await fixture(), { body } = await overview(f, '?period=all').expect(200);
    expect(body.data.metrics.period).toMatchObject({ failedSimulatedPaymentAttempts: 3, reservationsCreated: 8, cohortConfirmed: 4, reservationConversionRate: 50, simulatedGrossRevenuePaise: '149700' });
  });
  it.each(['duplicate', 'mismatch', 'legacy', 'outcome', 'unconfirmed'])('excludes anomalous SUCCESS evidence (%s) and surfaces a diagnostic without repairing data', async (kind) => {
    const f = await fixture();
    if (kind === 'duplicate') await f.payment(f.first._id, 'SUCCESS');
    else if (kind === 'legacy') await PaymentAttempt.collection.updateOne({ _id: f.success._id }, { $unset: { completedAt: '' } });
    else if (kind === 'unconfirmed') await Reservation.updateOne({ _id: f.first._id }, { $set: { status: 'EXPIRED' } });
    else await PaymentAttempt.collection.updateOne({ _id: f.success._id }, { $set: kind === 'mismatch' ? { amountPaise: 1 } : { simulationOutcome: 'FAILURE' } });
    const before = await records(), { body } = await overview(f).expect(200);
    expect(body.data.metrics.integrity.invalidSuccessReservations).toBe(1); expect(body.data.metrics.period).toMatchObject({ successfulSimulatedPayments: 3, simulatedGrossRevenuePaise: '99800' }); expect(await records()).toEqual(before);
  });
  it('sums safe paise values exactly even when the total exceeds JavaScript safe integers', async () => {
    const f = await fixture();
    for (const [reservation, payment] of [[f.first, f.success], [f.unissued, f.successUnissued]] as const) {
      await Reservation.collection.updateOne({ _id: reservation._id }, { $set: { amountPaise: Number.MAX_SAFE_INTEGER } });
      await PaymentAttempt.collection.updateOne({ _id: payment._id }, { $set: { amountPaise: Number.MAX_SAFE_INTEGER } });
    }
    expect((await overview(f).expect(200)).body.data.metrics.period.simulatedGrossRevenuePaise).toBe('18014398509531882');
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects corrupt payment amount %s from genuine revenue', async (amountPaise) => {
    const f = await fixture(); await PaymentAttempt.collection.updateOne({ _id: f.success._id }, { $set: { amountPaise } });
    expect((await overview(f).expect(200)).body.data.metrics.period.simulatedGrossRevenuePaise).toBe('99800');
  });
  it('invalid USED lifecycle is diagnosed rather than fabricated as attendance', async () => {
    const f = await fixture(); await Ticket.collection.updateOne({ _id: f.used._id }, { $set: { checkedInAt: null } });
    const { body } = await overview(f).expect(200); expect(body.data.metrics.current.ticketsUsed).toBe(0); expect(body.data.metrics.period.checkIns).toBe(0); expect(body.data.metrics.integrity.invalidTicketRecords).toBe(1);
  });
  it.each(['date_asc', 'date_desc', 'bookings', 'revenue', 'checkins'])('sorts %s with stable pagination and no missing/duplicate owned events', async (sort) => {
    const f = await fixture(), ids: string[] = [];
    for (const page of [1, 2]) { const { body } = await request(app).get(base + `events?sort=${sort}&page=${page}&limit=2`).set('Cookie', f.a.cookie).expect(200); ids.push(...body.data.events.map((e: { id: string }) => e.id)); expect(body.data.pagination).toEqual({ page, limit: 2, total: 4, totalPages: 2 }); }
    expect(new Set(ids).size).toBe(4); expect(ids.sort()).toEqual([f.paid.id, f.free.id, f.draft.id, f.cancelled.id].sort());
    expect((await request(app).get(base + `events?sort=${sort}&page=1&limit=2`).set('Cookie', f.a.cookie)).body.data.events).toHaveLength(2);
  });
  it('trends-only contract matches the combined dashboard report', async () => {
    const f = await fixture(), combined = await overview(f).expect(200), trends = await request(app).get(base + 'trends').set('Cookie', f.a.cookie).expect(200);
    expect(trends.body.data).toEqual({ scope: combined.body.data.scope, trends: combined.body.data.trends });
  });
  it('all report endpoints preserve complete business records and expose no attendee identifiers', async () => {
    const f = await fixture(), before = await records();
    for (const suffix of ['overview', 'events', 'trends']) { const r = await request(app).get(base + suffix).set('Cookie', f.a.cookie).expect(200); expect(r.text).not.toContain(f.first.userId.toString()); }
    expect(await records()).toEqual(before);
  });
  it('uses existing additive indexes for organizer and relationship lookups', async () => {
    await fixture();
    expect((await Event.collection.indexes()).some((i) => i.name === 'event_organizer')).toBe(true);
    expect((await Reservation.collection.indexes()).some((i) => i.key.eventId === 1)).toBe(true);
    expect((await PaymentAttempt.collection.indexes()).some((i) => i.key.reservationId === 1)).toBe(true);
    expect((await Ticket.collection.indexes()).some((i) => i.name === 'ticket_reservation_unique' && i.unique)).toBe(true);
  });
});

describe('analytics HTTP validation and reliability', () => {
  it('enforces live authentication and persisted organizer roles', async () => {
    const f = await fixture();
    for (const path of [base + 'overview', base + 'events', base + 'trends', `/api/organizer/events/${f.paid.id}/analytics`]) {
      await request(app).get(path).expect(401); await request(app).get(path).set('Cookie', f.attendee.cookie).expect(403);
    }
    await User.updateOne({ _id: f.a.id }, { $set: { role: 'ATTENDEE' } }); await overview(f).expect(403);
  });
  it.each(['?period=year', '?period=7d&period=30d', '?organizerId=other', '?eventId=bad', '?page=0', '?page=10001', '?limit=51', '?sort=$where', '?$where=1', '?from=2026-01-01', '?from=2026-01-01T00:00:00Z', '?from=bad&to=bad', '?from=2026-02-30T00:00:00Z&to=2026-03-04T00:00:00Z', '?from=2026-01-01T00:00:00Z&to=2025-01-01T00:00:00Z', '?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z', '?period=7d&from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z'])('rejects malformed/unbounded query %s', async (query) => {
    const a = await actor(app); await request(app).get(base + 'overview' + query).set('Cookie', a.cookie).expect(400);
  });
  it.each(['invalid', '000000000000000000000000'])('missing/malformed event %s returns safe 404', async (id) => {
    const a = await actor(app); await request(app).get(`/api/organizer/events/${id}/analytics`).set('Cookie', a.cookie).expect(404);
  });
  it('rejects conflicting path/query event scopes', async () => {
    const f = await fixture(); await request(app).get(`/api/organizer/events/${f.paid.id}/analytics?eventId=${f.free.id}`).set('Cookie', f.a.cookie).expect(400);
  });
  it('query failures produce a safe recoverable error rather than zero metrics', async () => {
    const f = await fixture(); vi.spyOn(Event, 'aggregate').mockImplementationOnce(() => { throw new Error('private database diagnostic'); });
    const failed = await overview(f).expect(503); expect(failed.body.error.code).toBe('ANALYTICS_UNAVAILABLE'); expect(failed.text).not.toContain('private database diagnostic'); expect(failed.body.data).toBeUndefined(); await overview(f).expect(200);
  });
  it('database outage fails closed, health stays live, reconnect restores real metrics', async () => {
    const f = await fixture(); await disconnectDatabase();
    try { await overview(f).expect(503); await request(app).get('/api/health').expect(200); }
    finally { await connectDatabase(database.uri); }
    expect((await overview(f).expect(200)).body.data.metrics.period.simulatedGrossRevenuePaise).toBe('149700');
  });
  it('invalid signing keys do not disable read-only analytics, but invalid JWT configuration does', async () => {
    const f = await fixture();
    // This fixture app has no ticket key and still reports genuine persisted data.
    await overview(f).expect(200);
    app = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: { JWT_SECRET: 'weak' } }); await overview(f).expect(503); await request(app).get('/api/health').expect(200);
  });
});

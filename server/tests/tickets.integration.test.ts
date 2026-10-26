import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { Event, Reservation, PaymentAttempt, Ticket, User, initializeModels } from '../src/models/index.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import { issueTicket } from '../src/modules/tickets/tickets.service.js';
import { parseTicketEnvironment, verifyTicket } from '../src/modules/tickets/tickets.crypto.js';
import { useDisposableDatabase } from './helpers/database.js';
import { actor, createDraft, eventTime, origin, type EventsApp } from './helpers/events.js';

const database = useDisposableDatabase();
const environment = { JWT_SECRET: randomBytes(48).toString('base64url'), TICKET_HMAC_SECRET: randomBytes(48).toString('base64url'), CLIENT_ORIGIN: origin, AUTH_REGISTER_MAX_REQUESTS: '1000' };
const config = parseTicketEnvironment(environment);
let app: EventsApp;
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(eventTime); app = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: environment }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function fixture(pricePaise = 19900, confirm = true) {
  const organizer = await actor(app);
  const draft = await createDraft(app, organizer.cookie, { capacity: 5, pricePaise }).expect(201);
  const eventId = draft.body.data.event.id as string;
  await request(app).post(`/api/organizer/events/${eventId}/publish`).set('Origin', origin).set('Cookie', organizer.cookie).expect(200);
  const attendee = await actor(app, 'ATTENDEE', 'attendee@example.test');
  const held = await request(app).post('/api/reservations').set('Origin', origin).set('Cookie', attendee.cookie).send({ eventId }).expect(201);
  const reservationId = held.body.data.reservation.id as string;
  if (confirm) await checkout(attendee.cookie, reservationId);
  return { ...attendee, organizer, eventId, reservationId };
}
async function checkout(cookie: string, id: string) {
  return request(app).post(`/api/reservations/${id}/payments`).set('Cookie', cookie).set('Origin', origin).set('Idempotency-Key', randomUUID()).send({ simulationOutcome: 'SUCCESS' }).expect(200);
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const issue = (f: Fixture, application = app) => request(application).post(`/api/reservations/${f.reservationId}/ticket`).set('Cookie', f.cookie).set('Origin', origin).send({});
const detail = (id: string, cookie: string, application = app) => request(application).get(`/api/tickets/${id}`).set('Cookie', cookie);
const wallet = (f: Fixture, query = '') => request(app).get('/api/tickets' + query).set('Cookie', f.cookie);
async function invariant(f: Fixture, expected = 1) {
  expect(await Ticket.countDocuments({ reservationId: f.reservationId })).toBe(expected);
  expect(await Reservation.findById(f.reservationId).lean()).toMatchObject({ status: 'CONFIRMED', amountPaise: 19900 });
  expect(await PaymentAttempt.countDocuments({ reservationId: f.reservationId, status: 'SUCCESS' })).toBe(1);
  const event = await Event.findById(f.eventId).orFail();
  expect(event.reservedCount).toBe(await Reservation.countDocuments({ eventId: f.eventId, status: { $in: ['HELD', 'CONFIRMED'] } }));
}
function barrier() {
  let arrived!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => { arrived = r; }), gate = new Promise<void>((r) => { release = r; });
  return { arrived, release, ready, gate };
}
describe('real durable ticket issuance', () => {
  it('20 simultaneous requests return one persisted ID, nonce and identical signed payload', async () => {
    const f = await fixture(), before = await PaymentAttempt.findOne({ reservationId: f.reservationId }).lean();
    const responses = await Promise.all(Array.from({ length: 20 }, () => issue(f)));
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.every((r) => [200, 201].includes(r.status))).toBe(true);
    expect(new Set(responses.map((r) => r.body.data.ticket.id)).size).toBe(1);
    expect(new Set(responses.map((r) => r.body.data.ticket.qrPayload)).size).toBe(1);
    const stored = await Ticket.findOne({ reservationId: f.reservationId }).lean().orFail();
    const data = responses[0]!.body.data.ticket;
    expect(verifyTicket(data.qrPayload, config)).toEqual({ v: 1, ticketId: stored._id.toString(), nonce: stored.qrNonce });
    expect(data).not.toHaveProperty('qrNonce'); expect(data).not.toHaveProperty('__v');
    expect((await PaymentAttempt.findById(before!._id).lean())?.updatedAt).toEqual(before!.updatedAt);
    await invariant(f);
  });
  it('two attendees receive distinct credentials and isolated wallets', async () => {
    const f = await fixture(), other = await actor(app, 'ATTENDEE', 'other@example.test');
    const held = await request(app).post('/api/reservations').set('Origin', origin).set('Cookie', other.cookie).send({ eventId: f.eventId }).expect(201);
    const second = { ...f, ...other, reservationId: held.body.data.reservation.id as string };
    await checkout(other.cookie, second.reservationId);
    const replies = await Promise.all([issue(f), issue(second)]);
    expect(replies[0]!.body.data.ticket.id).not.toBe(replies[1]!.body.data.ticket.id);
    expect(verifyTicket(replies[0]!.body.data.ticket.qrPayload, config)?.nonce).not.toBe(verifyTicket(replies[1]!.body.data.ticket.qrPayload, config)?.nonce);
    expect((await wallet(f)).body.data.tickets.map((t: { id: string }) => t.id)).toEqual([replies[0]!.body.data.ticket.id]);
    await detail(replies[0]!.body.data.ticket.id, other.cookie).expect(404);
  });
  it('rolls back forced persistence failure then safely retries without changing confirmation', async () => {
    const f = await fixture(); vi.spyOn(Ticket, 'create').mockRejectedValueOnce(new Error('private database failure'));
    const failure = await issue(f).expect(503); expect(JSON.stringify(failure.body)).not.toContain('private database'); await invariant(f, 0);
    await issue(f).expect(201); await issue(f).expect(200); await invariant(f);
  });
  it('recovers a real committed ticket after an uncertain response', async () => {
    const f = await fixture(), start = mongoose.connection.startSession.bind(mongoose.connection);
    vi.spyOn(mongoose.connection, 'startSession').mockImplementationOnce(async (...args) => {
      const session = await start(...args), run = session.withTransaction.bind(session);
      session.withTransaction = async (...input) => {
        await run(...input);
        const error = new mongoose.mongo.MongoServerError({ message: 'private unresolved commit' }); error.addErrorLabel('UnknownTransactionCommitResult'); throw error;
      };
      return session;
    });
    const response = await issue(f).expect(503); expect(response.body.error.code).toBe('TICKET_ISSUANCE_UNKNOWN');
    await invariant(f); const recovered = await issue(f).expect(200);
    expect((await detail(recovered.body.data.ticket.id, f.cookie)).body.data.ticket.qrPayload).toBe(recovered.body.data.ticket.qrPayload);
  });
  it('retrieves byte-identical credentials after app recreation and database reconnection, without writes', async () => {
    const f = await fixture(), first = await issue(f).expect(201), id = first.body.data.ticket.id;
    const before = await Ticket.findById(id).lean();
    await disconnectDatabase(); await connectDatabase(database.uri);
    app = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: environment });
    for (let i = 0; i < 3; i++) expect((await detail(id, f.cookie).expect(200)).body.data.ticket).toEqual(first.body.data.ticket);
    expect(await Ticket.findById(id).lean()).toEqual(before);
    const list = await wallet(f, '?reservationId=' + f.reservationId + '&limit=1').expect(200);
    expect(list.body.data.tickets[0]).not.toHaveProperty('qrPayload'); expect(list.text).not.toContain(before!.qrNonce);
    expect((await issue(f)).body.data.ticket).toEqual(first.body.data.ticket);
  });
  it('requires explicit zero-value checkout before free ticket issuance', async () => {
    const f = await fixture(0, false); await issue(f).expect(409); await checkout(f.cookie, f.reservationId);
    expect((await issue(f).expect(201)).body.data.ticket.amountPaise).toBe(0);
    expect(await Event.findById(f.eventId).lean()).toMatchObject({ reservedCount: 1 });
  });
  it('allows issuance and retrieval on the event day after its start', async () => {
    const f = await fixture();
    // Persist a started schedule without invalidating the short-lived auth session.
    await Event.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.eventId) }, { $set: { startAt: new Date(eventTime.getTime() - 1000), endAt: new Date(eventTime.getTime() + 3600000) } });
    const reply = await issue(f).expect(201); expect((await detail(reply.body.data.ticket.id, f.cookie)).body.data.ticket.qrPayload).toBe(reply.body.data.ticket.qrPayload);
  });
});
describe('ticket eligibility and current state', () => {
  it.each(['HELD', 'CANCELLED', 'EXPIRED'])('never issues for %s', async (status) => {
    const f = await fixture(19900, false); await Reservation.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.reservationId) }, { $set: { status } });
    await issue(f).expect(409); expect(await Ticket.countDocuments()).toBe(0);
  });
  it.each(['missing', 'FAILED', 'PENDING', 'amount', 'legacy'])('rejects unverified successful payment: %s', async (kind) => {
    const f = await fixture();
    if (kind === 'missing') await PaymentAttempt.deleteMany({});
    else await PaymentAttempt.collection.updateOne({ reservationId: new mongoose.Types.ObjectId(f.reservationId) }, kind === 'legacy' ? { $unset: { completedAt: '', simulationOutcome: '' } } : { $set: kind === 'amount' ? { amountPaise: 1 } : { status: kind } });
    await issue(f).expect(409); expect(await Ticket.countDocuments()).toBe(0);
  });
  it.each(['CANCELLED', 'DRAFT', 'missing'])('rejects unavailable event %s', async (status) => {
    const f = await fixture();
    if (status === 'missing') await Event.deleteMany({}); else await Event.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.eventId) }, { $set: { status } });
    await issue(f).expect(409); expect(await Ticket.countDocuments()).toBe(0);
  });
  it.each(['USED', 'REVOKED', 'EVENT_CANCELLED', 'PAYMENT_UNVERIFIED', 'RESERVATION_INVALID', 'EVENT_UNAVAILABLE'])('retains %s history while withholding active QR credentials', async (state) => {
    const f = await fixture(), issued = await issue(f).expect(201), id = issued.body.data.ticket.id;
    if (state === 'USED' || state === 'REVOKED') await Ticket.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { status: state, checkedInAt: state === 'USED' ? new Date() : null } });
    else if (state === 'EVENT_CANCELLED') await Event.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.eventId) }, { $set: { status: 'CANCELLED' } });
    else if (state === 'EVENT_UNAVAILABLE') await Event.deleteMany({});
    else if (state === 'RESERVATION_INVALID') await Reservation.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.reservationId) }, { $set: { status: 'CANCELLED' } });
    else await PaymentAttempt.deleteMany({});
    expect((await detail(id, f.cookie).expect(200)).body.data.ticket).toMatchObject({ admissionState: state, qrAvailable: false, qrPayload: null });
    expect((await wallet(f)).body.data.tickets).toHaveLength(1);
    if (state === 'USED' || state === 'REVOKED') expect((await issue(f).expect(200)).body.data.ticket.status).toBe(state);
    expect(await Ticket.countDocuments()).toBe(1);
  });
  it('never creates a nonce while reading a corrupt record', async () => {
    const f = await fixture(), issued = await issue(f).expect(201), id = issued.body.data.ticket.id;
    await Ticket.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $unset: { qrNonce: '' } });
    await detail(id, f.cookie).expect(503); await issue(f).expect(503);
    expect(await Ticket.collection.findOne({ _id: new mongoose.Types.ObjectId(id) })).not.toHaveProperty('qrNonce');
  });
  it.each([{ status: 'UNKNOWN' }, { checkedInAt: new Date() }])('never signs inconsistent ticket lifecycle state %#', async (fields) => {
    const f = await fixture(), issued = await issue(f).expect(201), id = issued.body.data.ticket.id;
    await Ticket.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: fields });
    await detail(id, f.cookie).expect(503); await issue(f).expect(503); expect(await Ticket.countDocuments()).toBe(1);
  });
  it('rejects a pre-existing ticket TTL at additive startup without removing history', async () => {
    await Ticket.collection.createIndex({ createdAt: 1 }, { name: 'test_invalid_ticket_ttl', expireAfterSeconds: 86400 });
    try { await expect(initializeModels()).rejects.toThrow('Ticket history cannot have a TTL index.'); }
    finally { await Ticket.collection.dropIndex('test_invalid_ticket_ttl'); }
  });
  it.each(['event', 'reservation', 'payment'])('revalidates when %s eligibility changes during issuance', async (source) => {
    const f = await fixture(), gate = barrier(), find = Ticket.findOne.bind(Ticket);
    vi.spyOn(Ticket, 'findOne').mockImplementationOnce((...args) => {
      const query = find(...args), exec = query.exec.bind(query);
      vi.spyOn(query, 'exec').mockImplementationOnce(async () => { const value = await exec(); gate.arrived(); await gate.gate; return value; }); return query;
    });
    const pending = issueTicket(f.id, f.reservationId, config); await gate.ready;
    try {
      if (source === 'event') await Event.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.eventId) }, { $set: { status: 'CANCELLED' }, $inc: { __v: 1 } });
      else if (source === 'reservation') await Reservation.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.reservationId) }, { $set: { status: 'CANCELLED' }, $inc: { __v: 1 } });
      else await PaymentAttempt.collection.updateOne({ reservationId: new mongoose.Types.ObjectId(f.reservationId) }, { $set: { status: 'FAILED' }, $inc: { __v: 1 } });
    } finally { gate.release(); }
    await expect(pending).rejects.toMatchObject({ code: 'TICKET_NOT_ELIGIBLE' }); expect(await Ticket.countDocuments()).toBe(0);
  });
});
describe('ticket HTTP boundaries', () => {
  it('protects role, Origin, owner, missing IDs and no-store without exposing credentials', async () => {
    const f = await fixture(), other = await actor(app, 'ATTENDEE', 'other@example.test');
    await request(app).get('/api/tickets').expect(401);
    await request(app).get('/api/tickets').set('Cookie', f.organizer.cookie).expect(403);
    await request(app).post(`/api/reservations/${f.reservationId}/ticket`).set('Cookie', f.cookie).send({}).expect(403);
    await request(app).post(`/api/reservations/${f.reservationId}/ticket`).set('Cookie', f.cookie).set('Origin', 'https://evil.test').send({}).expect(403);
    await issue({ ...f, cookie: other.cookie }).expect(404);
    const result = await issue(f).expect(201); expect(result.headers['cache-control']).toBe('no-store');
    await detail(result.body.data.ticket.id, other.cookie).expect(404); await detail('invalid', f.cookie).expect(404);
    await detail(randomBytes(12).toString('hex'), f.cookie).expect(404);
    await User.updateOne({ _id: f.id }, { $set: { role: 'ORGANIZER' } }); await detail(result.body.data.ticket.id, f.cookie).expect(403);
  });
  it.each(['?page=0', '?limit=51', '?status=ACTIVE', '?limit=2&limit=3', '?userId=other', '?reservationId=no', '?$where=1'])('strictly rejects query %s', async (query) => {
    const f = await fixture(); await wallet(f, query).expect(400);
  });
  it.each([{ nonce: 'client' }, { status: 'ISSUED' }, { reservationId: 'other' }, { amountPaise: 0 }, { userId: 'other' }])('rejects protected issuance fields %#', async (body) => {
    const f = await fixture(); await request(app).post(`/api/reservations/${f.reservationId}/ticket`).set('Cookie', f.cookie).set('Origin', origin).send(body).expect(400);
    expect(await Ticket.countDocuments()).toBe(0);
  });
  it('fails ticket configuration independently from health, discovery and payment', async () => {
    const f = await fixture(19900, false);
    app = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: { ...environment, TICKET_HMAC_SECRET: undefined } });
    await request(app).get('/api/health').expect(200); await request(app).get('/api/events').expect(200);
    await checkout(f.cookie, f.reservationId); await issue(f).expect(503); await invariant(f, 0);
    app = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: environment }); await issue(f).expect(201);
  });
  it('provides bounded stable owner-scoped pages, status filters and no read-driven issuance', async () => {
    const f = await fixture(); expect((await wallet(f)).body.data.tickets).toEqual([]); expect(await Ticket.countDocuments()).toBe(0);
    const issued = await issue(f).expect(201), id = issued.body.data.ticket.id;
    expect((await wallet(f, '?page=1&limit=1&status=ISSUED')).body.data.pagination).toEqual({ page: 1, limit: 1, total: 1, totalPages: 1 });
    expect((await wallet(f, '?page=2&limit=1')).body.data.tickets).toEqual([]);
    expect((await wallet(f, '?status=USED')).body.data.tickets).toEqual([]);
    expect((await wallet(f)).body.data.tickets[0].id).toBe(id);
    expect((await Ticket.collection.indexes()).every((i) => i.expireAfterSeconds === undefined)).toBe(true);
  });
});

import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { Event, Reservation, PaymentAttempt, Ticket, User } from '../src/models/index.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { parseTicketEnvironment, signTicket, verifyTicket } from '../src/modules/tickets/tickets.crypto.js';
import { useDisposableDatabase } from './helpers/database.js';
import { createDraft, origin } from './helpers/events.js';

const database = useDisposableDatabase(), realNow = Date.now.bind(Date);
const environment = { JWT_SECRET: randomBytes(48).toString('base64url'), TICKET_HMAC_SECRET: randomBytes(48).toString('base64url'), CLIENT_ORIGIN: origin, AUTH_REGISTER_MAX_REQUESTS: '1000', AUTH_LOGIN_MAX_REQUESTS: '1000' };
const config = parseTicketEnvironment(environment), password = 'Disposable Admission Test Password!';
let app: ReturnType<typeof createApp>, now: number;
beforeEach(() => { now = realNow(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); app = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: environment }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function account(role: 'ORGANIZER' | 'ATTENDEE', index: number) {
  const name = role === 'ORGANIZER' ? 'Admission Organizer ' + index : 'Admitted Attendee ' + index, email = role.toLowerCase() + index + '@example.test';
  const response = await request(app).post('/api/auth/register').set('Origin', origin).send({ name, email, role, password }).expect(201);
  return { cookie: (response.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!, id: response.body.data.user.id as string, name, email };
}
async function fixture(count = 1, pricePaise = 19900) {
  const organizer = await account('ORGANIZER', 1);
  const created = await createDraft(app, organizer.cookie, { capacity: 10, pricePaise, startAt: new Date(now + 1800000).toISOString(), endAt: new Date(now + 7200000).toISOString(), registrationDeadline: new Date(now + 600000).toISOString() }).expect(201);
  const eventId = created.body.data.event.id as string;
  await request(app).post(`/api/organizer/events/${eventId}/publish`).set('Cookie', organizer.cookie).set('Origin', origin).expect(200);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const attendee = await account('ATTENDEE', i + 1);
    const hold = await request(app).post('/api/reservations').set('Cookie', attendee.cookie).set('Origin', origin).send({ eventId }).expect(201);
    const reservationId = hold.body.data.reservation.id as string;
    await request(app).post(`/api/reservations/${reservationId}/payments`).set('Cookie', attendee.cookie).set('Origin', origin).set('Idempotency-Key', randomUUID()).send({ simulationOutcome: 'SUCCESS' }).expect(200);
    const issued = await request(app).post(`/api/reservations/${reservationId}/ticket`).set('Cookie', attendee.cookie).set('Origin', origin).send({}).expect(201);
    entries.push({ ...attendee, reservationId, ticketId: issued.body.data.ticket.id as string, qrPayload: issued.body.data.ticket.qrPayload as string });
  }
  return { organizer, eventId, entries, first: entries[0]!, before: { event: await Event.findById(eventId).lean(), reservations: await Reservation.find({ eventId }).sort({ _id: 1 }).lean(), payments: await PaymentAttempt.find().sort({ _id: 1 }).lean() } };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const path = (f: Fixture) => `/api/organizer/events/${f.eventId}/check-ins`;
const admit = (f: Fixture, qrPayload = f.first.qrPayload, cookie = f.organizer.cookie, application = app) => request(application).post(path(f)).set('Cookie', cookie).set('Origin', origin).send({ qrPayload });
const history = (f: Fixture, query = '', cookie = f.organizer.cookie, application = app) => request(application).get(path(f) + query).set('Cookie', cookie);
async function invariants(f: Fixture, used: number) {
  expect(await Event.findById(f.eventId).lean()).toEqual(f.before.event);
  expect(await Reservation.find({ eventId: f.eventId }).sort({ _id: 1 }).lean()).toEqual(f.before.reservations);
  expect(await PaymentAttempt.find().sort({ _id: 1 }).lean()).toEqual(f.before.payments);
  expect(await Ticket.countDocuments()).toBe(f.entries.length); expect(await Ticket.countDocuments({ status: 'USED' })).toBe(used);
}
function alter(qr: string, change: Record<string, unknown>, resign = false) {
  const [body, signature] = qr.split('.'); const changed = { ...JSON.parse(Buffer.from(body!, 'base64url').toString()) as Record<string, unknown>, ...change };
  const encoded = Buffer.from(JSON.stringify(changed)).toString('base64url');
  return encoded + '.' + (resign ? createHmac('sha256', config.key).update('KairoPass.ticket.v1.' + encoded).digest('base64url') : signature);
}
describe('atomic durable organizer admission', () => {
  it('20 simultaneous HTTP requests approve exactly once and retain one original nonce/timestamp', async () => {
    const f = await fixture(), original = await Ticket.findById(f.first.ticketId).lean().orFail();
    const responses = await Promise.all(Array.from({ length: 20 }, () => admit(f)));
    const winners = responses.filter((r) => r.status === 200), losers = responses.filter((r) => r.status === 409);
    expect(winners).toHaveLength(1); expect(losers).toHaveLength(19); expect(losers.every((r) => r.body.error.code === 'TICKET_ALREADY_USED')).toBe(true);
    const checkIn = winners[0]!.body.data.checkIn, stored = await Ticket.findById(f.first.ticketId).lean().orFail();
    expect(checkIn).toEqual({ ticketId: f.first.ticketId, eventId: f.eventId, status: 'USED', checkedInAt: stored.checkedInAt!.toISOString(), attendeeName: f.first.name, eventTitle: f.before.event!.title });
    expect(stored.qrNonce).toBe(original.qrNonce); expect(stored.createdAt).toEqual(original.createdAt);
    expect(losers.every((r) => r.body.error.details[0].message === checkIn.checkedInAt)).toBe(true);
    const replay = await admit(f).expect(409); expect(replay.body.error.code).toBe('TICKET_ALREADY_USED');
    expect((await Ticket.findById(f.first.ticketId).lean())!.checkedInAt).toEqual(stored.checkedInAt); await invariants(f, 1);
  });
  it('two independently authenticated scanner sessions race to one approval', async () => {
    const f = await fixture(); const login = await request(app).post('/api/auth/login').set('Origin', origin).send({ email: f.organizer.email, password }).expect(200);
    const secondCookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect(secondCookie).not.toBe(f.organizer.cookie);
    expect((await Promise.all([admit(f), admit(f, f.first.qrPayload, secondCookie)])).map((r) => r.status).sort()).toEqual([200, 409]); await invariants(f, 1);
  });
  it('five independent legitimate tickets are consumed concurrently without event contention', async () => {
    const f = await fixture(5); const responses = await Promise.all(f.entries.map((entry) => admit(f, entry.qrPayload)));
    expect(responses.every((r) => r.status === 200)).toBe(true); expect(new Set(responses.map((r) => r.body.data.checkIn.ticketId)).size).toBe(5); await invariants(f, 5);
  });
  it('checks in a free booking through the same verified zero-value payment invariant', async () => {
    const f = await fixture(1, 0); await admit(f).expect(200); await invariants(f, 1);
  });
  it('preserves a pre-existing USED timestamp on replay', async () => {
    const f = await fixture(), checkedInAt = new Date(now - 90000);
    await Ticket.updateOne({ _id: f.first.ticketId }, { $set: { status: 'USED', checkedInAt } });
    const reply = await admit(f).expect(409); expect(reply.body.error).toMatchObject({ code: 'TICKET_ALREADY_USED', details: [{ field: 'checkedInAt', message: checkedInAt.toISOString() }] });
    expect((await Ticket.findById(f.first.ticketId).lean())!.checkedInAt).toEqual(checkedInAt); await invariants(f, 1);
  });
  it('fails safely before the write and recovers through explicit retry', async () => {
    const f = await fixture(), update = Ticket.findOneAndUpdate.bind(Ticket);
    vi.spyOn(Ticket, 'findOneAndUpdate').mockImplementationOnce((...args) => { const query = update(...args); vi.spyOn(query, 'exec').mockRejectedValueOnce(new Error('private admission failure')); return query; });
    const failure = await admit(f).expect(503); expect(failure.text).not.toContain('private admission failure'); await invariants(f, 0);
    await admit(f).expect(200); await invariants(f, 1);
  });
  it('does not invent approval after a real committed write loses its response', async () => {
    const f = await fixture(), update = Ticket.findOneAndUpdate.bind(Ticket);
    vi.spyOn(Ticket, 'findOneAndUpdate').mockImplementationOnce((...args) => { const query = update(...args), exec = query.exec.bind(query); vi.spyOn(query, 'exec').mockImplementationOnce(async () => { await exec(); throw new Error('private response interruption'); }); return query; });
    expect((await admit(f).expect(503)).body.error.code).toBe('CHECKIN_OUTCOME_UNKNOWN'); await invariants(f, 1);
    const before = await Ticket.findById(f.first.ticketId).lean(); await admit(f).expect(409);
    expect((await history(f)).body.data.checkIns).toHaveLength(1); expect(await Ticket.findById(f.first.ticketId).lean()).toEqual(before);
  });
  it('persists single-use state through app recreation and database reconnection', async () => {
    const f = await fixture(), approved = await admit(f).expect(200);
    await disconnectDatabase(); await connectDatabase(database.uri); app = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: environment });
    const replay = await admit(f).expect(409); expect(replay.body.error.details[0].message).toBe(approved.body.data.checkIn.checkedInAt); await invariants(f, 1);
  });
  it('attendee wallet/detail refreshes show USED, actual time and no active QR', async () => {
    const f = await fixture(), approved = await admit(f).expect(200);
    const detail = await request(app).get('/api/tickets/' + f.first.ticketId).set('Cookie', f.first.cookie).expect(200);
    expect(detail.body.data.ticket).toMatchObject({ status: 'USED', admissionState: 'USED', checkedInAt: approved.body.data.checkIn.checkedInAt, qrAvailable: false, qrPayload: null });
    expect((await request(app).get('/api/tickets').set('Cookie', f.first.cookie)).body.data.tickets[0].status).toBe('USED');
  });
});
describe('cryptographic and relationship security', () => {
  it.each(['empty', 'random', 'bare', 'signature', 'ticketId', 'nonce', 'version', 'unknown', 'stored-nonce', 'extra', 'padding', 'truncated', 'extra-segment'])('rejects %s credentials without writes', async (kind) => {
    const f = await fixture(); let qr = f.first.qrPayload;
    if (kind === 'empty') qr = '';
    else if (kind === 'random') qr = 'random text';
    else if (kind === 'bare') qr = f.first.ticketId;
    else if (kind === 'signature') qr = qr.slice(0, qr.indexOf('.') + 1) + randomBytes(32).toString('base64url');
    else if (kind === 'ticketId' || kind === 'unknown') qr = alter(qr, { ticketId: randomBytes(12).toString('hex') }, kind === 'unknown');
    else if (kind === 'nonce' || kind === 'stored-nonce') qr = alter(qr, { nonce: randomBytes(32).toString('base64url') }, kind === 'stored-nonce');
    else if (kind === 'version') qr = alter(qr, { v: 2 }, true);
    else if (kind === 'extra') qr = alter(qr, { attendee: 'private' }, true);
    else if (kind === 'padding') qr += '=';
    else if (kind === 'truncated') qr = qr.slice(0, -8);
    else qr += '.extra';
    const response = await admit(f, qr); expect([400, 404]).toContain(response.status); await invariants(f, 0);
  });
  it('rejects credentials signed with another key', async () => {
    const f = await fixture(), payload = verifyTicket(f.first.qrPayload, config)!;
    await admit(f, signTicket(payload, parseTicketEnvironment({ ...environment, TICKET_HMAC_SECRET: randomBytes(48).toString('base64url') }))).expect(400); await invariants(f, 0);
  });
  it('wrong owner and wrong event disclose no attendee data or original event information', async () => {
    const f = await fixture(), other = await account('ORGANIZER', 2);
    const denied = await admit(f, f.first.qrPayload, other.cookie).expect(404); expect(denied.text).not.toContain(f.first.name);
    await history(f, '', other.cookie).expect(404);
    const otherEvent = await createDraft(app, other.cookie).expect(201);
    const wrong = await request(app).post(`/api/organizer/events/${otherEvent.body.data.event.id}/check-ins`).set('Cookie', other.cookie).set('Origin', origin).send({ qrPayload: f.first.qrPayload }).expect(404);
    expect(wrong.body.error.code).toBe('INVALID_TICKET'); expect(wrong.text).not.toContain(f.first.name); expect(wrong.text).not.toContain(f.before.event!.title); await invariants(f, 0);
  });
  it.each(['HELD', 'EXPIRED', 'CANCELLED'])('rejects a currently %s reservation', async (status) => {
    const f = await fixture(); await Reservation.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.first.reservationId) }, { $set: { status } });
    expect((await admit(f).expect(409)).body.error.code).toBe('RESERVATION_NOT_CONFIRMED'); expect(await Ticket.countDocuments({ status: 'USED' })).toBe(0);
  });
  it.each(['missing', 'FAILED', 'PENDING', 'amount', 'legacy'])('rejects invalid successful-payment evidence %s', async (kind) => {
    const f = await fixture();
    if (kind === 'missing') await PaymentAttempt.deleteMany({});
    else await PaymentAttempt.collection.updateOne({ reservationId: new mongoose.Types.ObjectId(f.first.reservationId) }, kind === 'legacy' ? { $unset: { simulationOutcome: '', completedAt: '' } } : { $set: kind === 'amount' ? { amountPaise: 1 } : { status: kind } });
    expect((await admit(f).expect(409)).body.error.code).toBe('PAYMENT_NOT_VERIFIED'); expect(await Ticket.countDocuments({ status: 'USED' })).toBe(0);
  });
  it('never admits a revoked ticket or overwrites its state', async () => {
    const f = await fixture(); await Ticket.updateOne({ _id: f.first.ticketId }, { $set: { status: 'REVOKED' } });
    expect((await admit(f).expect(409)).body.error.code).toBe('TICKET_REVOKED'); expect((await Ticket.findById(f.first.ticketId).lean())!.status).toBe('REVOKED'); await invariants(f, 0);
  });
  it.each([{ status: 'UNKNOWN' }, { checkedInAt: new Date() }, { status: 'USED', checkedInAt: null }])('rejects corrupt lifecycle state %#', async (fields) => {
    const f = await fixture(); await Ticket.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.first.ticketId) }, { $set: fields }); await admit(f).expect(503);
  });
});
describe('admission window and authoritative write clock', () => {
  it('rejects one millisecond before opening and allows the exact opening boundary', async () => {
    const f = await fixture();
    await Event.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.eventId) }, { $set: { startAt: new Date(now + 7200001), endAt: new Date(now + 10800000) } });
    expect((await admit(f).expect(409)).body.error.code).toBe('CHECKIN_NOT_OPEN');
    vi.setSystemTime(now + 1); await admit(f).expect(200);
    expect(await Ticket.countDocuments({ status: 'USED' })).toBe(1); expect((await Event.findById(f.eventId).lean())!.reservedCount).toBe(1);
  });
  it('allows an underway event after its registration deadline without using discovery', async () => {
    const f = await fixture(); await Event.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.eventId) }, { $set: { startAt: new Date(now - 60000), registrationDeadline: new Date(now - 120000) } });
    await request(app).get('/api/events/' + f.eventId).expect(404); await admit(f).expect(200);
  });
  it.each(['at-end', 'after-end'])('rejects %s without consuming the ticket', async (boundary) => {
    const f = await fixture(); vi.setSystemTime(f.before.event!.endAt.getTime() + (boundary === 'after-end' ? 1 : 0));
    expect((await admit(f).expect(409)).body.error.code).toBe('CHECKIN_CLOSED'); await invariants(f, 0);
  });
  it.each(['CANCELLED', 'DRAFT'])('rejects a %s event', async (status) => {
    const f = await fixture(); await Event.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.eventId) }, { $set: { status } });
    const response = await admit(f).expect(409); expect(response.body.error.code).toBe(status === 'CANCELLED' ? 'EVENT_CANCELLED' : 'EVENT_NOT_PUBLISHED'); expect(await Ticket.countDocuments({ status: 'USED' })).toBe(0);
  });
  it('MongoDB rejects a write delayed past close even when the app clock lags', async () => {
    const f = await fixture(), end = realNow() + 150;
    await Event.collection.updateOne({ _id: new mongoose.Types.ObjectId(f.eventId) }, { $set: { startAt: new Date(now - 3600000), endAt: new Date(end), registrationDeadline: new Date(now - 3600000) } });
    const update = Ticket.findOneAndUpdate.bind(Ticket);
    vi.spyOn(Ticket, 'findOneAndUpdate').mockImplementationOnce((...args) => { const query = update(...args), exec = query.exec.bind(query); vi.spyOn(query, 'exec').mockImplementationOnce(async () => { await new Promise((r) => setTimeout(r, Math.max(0, end - realNow()) + 30)); return exec(); }); return query; });
    await admit(f).expect(409); expect(await Ticket.countDocuments({ status: 'USED' })).toBe(0); expect((await Ticket.findById(f.first.ticketId).lean())!.checkedInAt).toBeNull();
  });
});
describe('private bounded check-in history and HTTP guards', () => {
  it('reports a failed history read without implying an admission mutation or fake empty success', async () => {
    const f = await fixture(), aggregate = Reservation.aggregate.bind(Reservation);
    vi.spyOn(Reservation, 'aggregate').mockImplementationOnce((...args) => { const query = aggregate(...args); vi.spyOn(query, 'exec').mockRejectedValueOnce(new Error('private history failure')); return query; });
    const response = await history(f).expect(503); expect(response.body.error.code).toBe('CHECKIN_HISTORY_UNAVAILABLE'); expect(response.text).not.toContain('private history failure');
    await invariants(f, 0); await history(f).expect(200);
  });
  it('returns empty history without any read-driven mutation', async () => {
    const f = await fixture(), before = await Ticket.findById(f.first.ticketId).lean(); const response = await history(f).expect(200);
    expect(response.body.data.checkIns).toEqual([]); expect(response.body.data.pagination.total).toBe(0); expect(response.body.data.window.state).toBe('OPEN'); expect(response.headers['cache-control']).toBe('no-store'); expect(await Ticket.findById(f.first.ticketId).lean()).toEqual(before);
  });
  it('paginates actual successful admissions newest first with stable ties and safe projections', async () => {
    const f = await fixture(5); await Promise.all(f.entries.map((entry) => admit(f, entry.qrPayload).expect(200)));
    await Ticket.updateMany({ status: 'USED' }, { $set: { checkedInAt: new Date(now - 1000) } });
    const expected = (await Ticket.find({ status: 'USED' }).sort({ checkedInAt: -1, _id: -1 }).lean()).map((t) => t._id.toString());
    const entries: { ticketId: string }[] = [];
    for (const page of [1, 2, 3]) { const response = await history(f, `?page=${page}&limit=2`).expect(200); expect(response.body.data.pagination).toEqual({ page, limit: 2, total: 5, totalPages: 3 }); entries.push(...response.body.data.checkIns); expect(response.text).not.toContain('qrPayload'); expect(response.text).not.toContain('qrNonce'); expect(response.text).not.toContain('@example.test'); }
    expect(entries.map((entry) => entry.ticketId)).toEqual(expected); expect((await history(f, '?page=4&limit=2')).body.data.checkIns).toEqual([]);
    const other = await account('ORGANIZER', 2); await history(f, '', other.cookie).expect(404);
  });
  it('enforces authentication, current role, exact Origin, resource IDs and no-store', async () => {
    const f = await fixture(); await request(app).post(path(f)).set('Origin', origin).send({ qrPayload: f.first.qrPayload }).expect(401);
    await request(app).get(path(f)).expect(401); await admit(f, f.first.qrPayload, f.first.cookie).expect(403);
    await request(app).post(path(f)).set('Cookie', f.organizer.cookie).send({ qrPayload: f.first.qrPayload }).expect(403);
    await request(app).post(path(f)).set('Cookie', f.organizer.cookie).set('Origin', 'https://evil.test').send({ qrPayload: f.first.qrPayload }).expect(403);
    await admit({ ...f, eventId: 'invalid' }).expect(404); await history({ ...f, eventId: 'invalid' }).expect(404);
    await request(app).post('/api/organizer/events//check-ins').set('Cookie', f.organizer.cookie).set('Origin', origin).send({ qrPayload: f.first.qrPayload }).expect(404);
    const approved = await admit(f).expect(200); expect(approved.headers['cache-control']).toBe('no-store');
    await User.updateOne({ _id: f.organizer.id }, { $set: { role: 'ATTENDEE' } }); await history(f).expect(403);
  });
  it.each(['?page=0', '?limit=51', '?limit=2&limit=3', '?userId=other', '?sort=oldest', '?$where=1'])('rejects history query %s', async (query) => {
    const f = await fixture(); await history(f, query).expect(400);
  });
  it.each([{}, { qrPayload: null }, { qrPayload: {} }, { qrPayload: ['bad'] }, { qrPayload: 'x'.repeat(513) }, { qrPayload: 'bad', status: 'USED' }, { qrPayload: 'bad', checkedInAt: '2040-01-01' }, { qrPayload: 'bad', organizerId: 'other' }])('rejects invalid/protected bodies %#', async (body) => {
    const f = await fixture(); await request(app).post(path(f)).set('Cookie', f.organizer.cookie).set('Origin', origin).send(body).expect(400); await invariants(f, 0);
  });
  it.each(['missing', 'weak', 'reused'])('fails signature configuration closed: %s, while history and health remain independent', async (kind) => {
    const f = await fixture(); app = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: { ...environment, TICKET_HMAC_SECRET: kind === 'missing' ? undefined : kind === 'weak' ? 'weak' : environment.JWT_SECRET } });
    expect((await admit(f).expect(503)).body.error.code).toBe('CHECKIN_CONFIGURATION_UNAVAILABLE'); await history(f).expect(200); await request(app).get('/api/health').expect(200); await invariants(f, 0);
  });
  it('fails safely when the database is unavailable, then recovers without state changes', async () => {
    const f = await fixture(); await disconnectDatabase();
    try { await admit(f).expect(503); await history(f).expect(503); await request(app).get('/api/health').expect(200); }
    finally { await connectDatabase(database.uri); }
    await invariants(f, 0); await admit(f).expect(200);
  });
  it('never logs credentials, secrets, attendee email or private exception text', async () => {
    const f = await fixture(), info = vi.spyOn(console, 'info').mockImplementation(() => {}), error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logged = createApp({ mode: 'test', logLevel: 'info', authEnvironment: environment });
    await admit(f, f.first.qrPayload, f.organizer.cookie, logged).expect(200);
    await admit(f, f.first.qrPayload, f.organizer.cookie, logged).expect(409);
    const output = JSON.stringify([...info.mock.calls, ...error.mock.calls]);
    for (const secret of [f.first.qrPayload, environment.JWT_SECRET, environment.TICKET_HMAC_SECRET, f.first.email]) expect(output.includes(secret)).toBe(false);
  });
});

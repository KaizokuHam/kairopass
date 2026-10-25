import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server-core';
import { createApp } from '../src/app.js';
import { checkDatabaseReadiness, connectDatabase, disconnectDatabase, isDatabaseReady } from '../src/config/database.js';
import { User, Event, Reservation, PaymentAttempt, Ticket, initializeModels } from '../src/models/index.js';
import { toPublicUser } from '../src/types/public-user.js';

// Never consume MONGODB_URI here. Own every server and every document cleaned up.
const databaseName = `kairopass_test_${randomUUID().replaceAll('-', '')}`;
const binary = { version: '8.2.6', downloadDir: fileURLToPath(new URL('../../.mongodb-binaries/', import.meta.url)) };
let replicaSet: MongoMemoryReplSet;
let uri: string;

const userInput = (email = `${randomUUID()}@example.test`) => ({
  name: 'Test attendee', email, passwordHash: 'test-fixture-not-a-real-password-hash'
});
const eventInput = (organizerId = new Types.ObjectId()) => ({
  organizerId, title: 'Test event', venue: 'Test venue',
  startAt: new Date('2030-01-02T10:00:00Z'), endAt: new Date('2030-01-02T12:00:00Z'),
  registrationDeadline: new Date('2030-01-02T09:00:00Z'), capacity: 2, pricePaise: 15000
});
const reservationInput = () => ({
  userId: new Types.ObjectId(), eventId: new Types.ObjectId(),
  expiresAt: new Date(Date.now() + 15 * 60_000), amountPaise: 15000
});
const paymentInput = (reservationId = new Types.ObjectId()) => ({
  reservationId, transactionId: `sim_${randomUUID()}`, idempotencyKey: randomUUID(), amountPaise: 15000
});

beforeAll(async () => {
  replicaSet = new MongoMemoryReplSet({ binary, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await replicaSet.start();
  uri = replicaSet.getUri(databaseName);
  // Both callers must share one connection and one index-initialization operation.
  await Promise.all([connectDatabase(uri), connectDatabase(uri)]);
});

beforeEach(async () => {
  if (mongoose.connection.name !== databaseName || mongoose.connection.host !== '127.0.0.1') {
    throw new Error('Refusing cleanup outside the owned disposable test database.');
  }
  for (const model of [Ticket, PaymentAttempt, Reservation, Event, User]) {
    await model.collection.deleteMany({});
  }
});

afterAll(async () => {
  try { await disconnectDatabase(); }
  finally { await replicaSet?.stop(); }
});

describe('connection and real indexes', () => {
  it('connects once, initializes indexes, pings successfully, and serves readiness', async () => {
    expect(isDatabaseReady()).toBe(true);
    expect(await checkDatabaseReadiness()).toBe(true);
    const client = mongoose.connection.getClient();
    await connectDatabase(uri);
    expect(mongoose.connection.getClient()).toBe(client);
    const response = await request(createApp({ mode: 'test', logLevel: 'silent' })).get('/api/ready').expect(200);
    expect(response.body).toEqual({ success: true, message: 'KairoPass database is ready' });
  });

  it('creates every declared index with its required keys and uniqueness options', async () => {
    await initializeModels(); // Safe to repeat; does not drop existing indexes.
    for (const model of [User, Event, Reservation, PaymentAttempt, Ticket]) {
      const actual = await model.collection.listIndexes().toArray();
      for (const [key, options] of model.schema.indexes()) {
        const index = actual.find((candidate) => candidate.name === options.name);
        expect(index?.key).toEqual(key);
        expect(Boolean(index?.unique)).toBe(Boolean(options.unique));
        expect(index?.partialFilterExpression).toEqual(options.partialFilterExpression);
      }
    }
    const reservations = await Reservation.collection.listIndexes().toArray();
    expect(reservations.every((index) => index.expireAfterSeconds === undefined)).toBe(true);
    expect(reservations.find((index) => index.name === 'reservation_active_user_event_unique')?.partialFilterExpression)
      .toEqual({ status: { $in: ['HELD', 'CONFIRMED'] } });
  });
});

describe('users and public data', () => {
  it('creates normalized users, defaults the role, timestamps records, and hides password hashes', async () => {
    const user = await User.create({ ...userInput('  ATTENDEE@Example.test  '), name: '  Test person  ' });
    expect(user.name).toBe('Test person');
    expect(user.email).toBe('attendee@example.test');
    expect(user.role).toBe('ATTENDEE');
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.toJSON()).not.toHaveProperty('passwordHash');
    expect(user.toObject()).not.toHaveProperty('passwordHash');
    const ordinary = await User.findById(user._id).orFail();
    expect(ordinary.passwordHash).toBeUndefined();
    const credential = await User.findById(user._id).select('+passwordHash').orFail();
    expect(credential.passwordHash).toBe(user.passwordHash);
    expect(JSON.stringify(credential)).not.toContain('passwordHash');
    expect(toPublicUser(credential)).toEqual({
      id: user._id.toHexString(), name: user.name, email: user.email, role: 'ATTENDEE',
      createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString()
    });
  });

  it('rejects duplicate normalized emails through the database unique index', async () => {
    await User.create(userInput('person@example.test'));
    await expect(User.create(userInput(' PERSON@EXAMPLE.TEST '))).rejects.toMatchObject({ code: 11000 });
  });

  it.each([
    { name: '', email: 'valid@example.test', passwordHash: 'test-hash' },
    { name: 'Name', email: 'invalid-email', passwordHash: 'test-hash' },
    { name: 'Name', email: 'valid@example.test' },
    { name: 'Name', passwordHash: 'test-hash' }
  ])('rejects missing or invalid user fields: %o', async (input) => {
    await expect(User.create(input)).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
  });
});

describe('event document integrity', () => {
  it('supports free events and valid boundary inventory', async () => {
    const event = await Event.create({ ...eventInput(), pricePaise: 0, reservedCount: 2 });
    expect(event.status).toBe('DRAFT');
    expect(event.pricePaise).toBe(0);
    expect(event.reservedCount).toBe(event.capacity);
  });

  it.each([
    { capacity: 0 }, { capacity: -1 }, { capacity: 1.5 },
    { pricePaise: -1 }, { pricePaise: 1.5 }, { pricePaise: Number.MAX_SAFE_INTEGER + 1 },
    { reservedCount: -1 }, { reservedCount: 3 }, { reservedCount: 0.5 },
    { endAt: new Date('2030-01-02T10:00:00Z') },
    { endAt: new Date('2030-01-01T10:00:00Z') },
    { registrationDeadline: new Date('2030-01-02T11:00:00Z') },
    { organizerId: 'invalid-object-id' }
  ])('rejects an invalid event: %o', async (change) => {
    await expect(Event.create({ ...eventInput(), ...change })).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
  });
});

describe('reservation history and inventory boundary', () => {
  it('creates a valid hold with an immutable price snapshot', async () => {
    const reservation = await Reservation.create(reservationInput());
    expect(reservation.status).toBe('HELD');
    // Mongoose strips immutable paths from ordinary updates; timestamps may still change.
    await Reservation.updateOne({ _id: reservation._id }, { $set: { amountPaise: 1 } }, { runValidators: true });
    expect((await Reservation.findById(reservation._id).orFail()).amountPaise).toBe(15000);
  });

  it.each(['HELD', 'CONFIRMED'] as const)('rejects a second active %s reservation', async (status) => {
    const input = reservationInput();
    await Reservation.create(input);
    await expect(Reservation.create({ ...input, status })).rejects.toMatchObject({ code: 11000 });
  });

  it.each(['EXPIRED', 'CANCELLED'] as const)('retains %s history alongside a newer active reservation', async (status) => {
    const input = reservationInput();
    const historical = await Reservation.create(input);
    historical.status = status;
    await historical.save();
    await Reservation.create({ ...input, status });
    await Reservation.create(input);
    expect(await Reservation.countDocuments({ userId: input.userId, eventId: input.eventId })).toBe(3);
  });

  it('retains elapsed holds until explicit expiration; time alone does not release their uniqueness slot', async () => {
    const input = { ...reservationInput(), expiresAt: new Date(Date.now() - 60_000) };
    const hold = await Reservation.create(input);
    expect((await Reservation.findById(hold._id).orFail()).status).toBe('HELD');
    await expect(Reservation.create(input)).rejects.toMatchObject({ code: 11000 });
  });

  it('does not pretend ObjectId references enforce existence or cross-document counters', async () => {
    const input = reservationInput();
    await Reservation.create(input);
    expect(await User.exists({ _id: input.userId })).toBeNull();
    expect(await Event.exists({ _id: input.eventId })).toBeNull();
    // Task 08 must validate ownership/existence and update inventory in one transaction.
  });
});

describe('simulated payment attempts', () => {
  it('rejects duplicate transaction IDs', async () => {
    const first = paymentInput();
    await PaymentAttempt.create(first);
    await expect(PaymentAttempt.create({ ...paymentInput(), transactionId: first.transactionId })).rejects.toMatchObject({ code: 11000 });
  });

  it('deduplicates keys per reservation while retaining failed retries and allowing distinct attempts', async () => {
    const first = paymentInput();
    await PaymentAttempt.create({ ...first, status: 'FAILED', failureReason: 'Simulated decline' });
    await expect(PaymentAttempt.create({ ...first, transactionId: `sim_${randomUUID()}` })).rejects.toMatchObject({ code: 11000 });
    await PaymentAttempt.create(paymentInput(first.reservationId));
    await PaymentAttempt.create({ ...paymentInput(), idempotencyKey: first.idempotencyKey });
    expect(await PaymentAttempt.countDocuments({ reservationId: first.reservationId })).toBe(2);
  });

  it('does not confirm reservations or issue tickets when recording a failed payment', async () => {
    const reservation = await Reservation.create(reservationInput());
    await PaymentAttempt.create({ ...paymentInput(reservation._id), status: 'FAILED' });
    expect((await Reservation.findById(reservation._id).orFail()).status).toBe('HELD');
    expect(await Ticket.countDocuments()).toBe(0);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid payment paise: %s', async (amountPaise) => {
    await expect(PaymentAttempt.create({ ...paymentInput(), amountPaise })).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
  });
});

describe('ticket identity', () => {
  it('generates independent 256-bit nonces and starts as unchecked ISSUED', async () => {
    const first = await Ticket.create({ reservationId: new Types.ObjectId() });
    const second = await Ticket.create({ reservationId: new Types.ObjectId() });
    expect(first.status).toBe('ISSUED');
    expect(first.checkedInAt).toBeNull();
    expect(Buffer.from(first.qrNonce, 'base64url')).toHaveLength(32);
    expect(first.qrNonce).not.toBe(second.qrNonce);
    await expect(Ticket.create({ reservationId: first.reservationId })).rejects.toMatchObject({ code: 11000 });
    await expect(Ticket.create({ reservationId: new Types.ObjectId(), qrNonce: first.qrNonce })).rejects.toMatchObject({ code: 11000 });
  });

  it('validates check-in timestamp consistency', async () => {
    await expect(Ticket.create({ reservationId: new Types.ObjectId(), status: 'USED' })).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
    await expect(Ticket.create({ reservationId: new Types.ObjectId(), checkedInAt: new Date() })).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
  });
});

describe('replica-set transactions', () => {
  it('commits writes across collections', async () => {
    const session = await mongoose.startSession();
    const organizerId = new Types.ObjectId();
    try {
      await session.withTransaction(async () => {
        await User.create([{ ...userInput(), _id: organizerId, role: 'ORGANIZER' }], { session });
        await Event.create([eventInput(organizerId)], { session });
      });
    } finally { await session.endSession(); }
    expect(await User.countDocuments()).toBe(1);
    expect(await Event.countDocuments()).toBe(1);
  });

  it('rolls back all writes after an aborted transaction', async () => {
    const session = await mongoose.startSession();
    try {
      await expect(session.withTransaction(async () => {
        await User.create([userInput()], { session });
        await Event.create([eventInput()], { session });
        throw new Error('Abort test transaction');
      })).rejects.toThrow('Abort test transaction');
    } finally { await session.endSession(); }
    expect(await User.countDocuments()).toBe(0);
    expect(await Event.countDocuments()).toBe(0);
  });
});

describe('connection failure and recovery', () => {
  it('disconnects gracefully, reports unready, rejects standalone topology, sanitizes failures, and reconnects', async () => {
    await disconnectDatabase();
    expect(isDatabaseReady()).toBe(false);
    expect(await checkDatabaseReadiness()).toBe(false);
    const standalone = await MongoMemoryServer.create({ binary });
    try {
      await expect(connectDatabase(standalone.getUri(databaseName))).rejects.toThrow('MongoDB initialization failed');
    } finally { await standalone.stop(); }
    // Port 1 on loopback is deliberately unavailable; never use an external database.
    const privateUri = 'mongodb://private-user:private-password@127.0.0.1:1/unavailable';
    const logs = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await connectDatabase(privateUri);
      throw new Error('Expected an initial connection failure');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain('MongoDB initialization failed');
      expect(String(error)).not.toMatch(/private-user|private-password|127\.0\.0\.1/);
    }
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(/private-user|private-password/);
    await connectDatabase(uri);
    expect(await checkDatabaseReadiness()).toBe(true);
  });
});

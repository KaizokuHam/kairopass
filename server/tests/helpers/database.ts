import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { AuthSession, User, Event, Reservation, PaymentAttempt, Ticket } from '../../src/models/index.js';

/** Test-owned replica set only. Never consume application MONGODB_URI or shared data. */
export function useDisposableDatabase() {
  const databaseName = `kairopass_auth_test_${randomUUID().replaceAll('-', '')}`;
  let replica: MongoMemoryReplSet | undefined;
  beforeAll(async () => {
    replica = new MongoMemoryReplSet({
      binary: { version: '8.2.6', downloadDir: fileURLToPath(new URL('../../../.mongodb-binaries/', import.meta.url)) },
      replSet: { count: 1, storageEngine: 'wiredTiger' }
    });
    await replica.start();
    await connectDatabase(replica.getUri(databaseName));
  });
  beforeEach(async () => {
    if (mongoose.connection.name !== databaseName || mongoose.connection.host !== '127.0.0.1') {
      throw new Error('Refusing cleanup outside the owned disposable authentication database.');
    }
    for (const model of [AuthSession, Ticket, PaymentAttempt, Reservation, Event, User]) {
      await model.collection.deleteMany({});
    }
  });
  afterAll(async () => {
    try { await disconnectDatabase(); }
    finally { await replica?.stop(); }
  });
  return {
    get uri(): string {
      if (!replica) throw new Error('Disposable database has not been started.');
      return replica.getUri(databaseName);
    }
  };
}

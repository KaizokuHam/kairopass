import mongoose from 'mongoose';
import { env } from './env.js';
import { ApiError } from '../lib/api-error.js';
import type { RequestHandler } from 'express';
import { initializeModels } from '../models/index.js';

mongoose.set('bufferCommands', false);

let connecting: Promise<void> | undefined;
let disconnecting: Promise<void> | undefined;
let activeUri: string | undefined;
let initialized = false;

mongoose.connection.on('error', () => {
  if (env.LOG_LEVEL !== 'silent') console.error('MongoDB connection error; database readiness is unavailable.');
});
mongoose.connection.on('disconnected', () => {
  if (env.LOG_LEVEL !== 'silent') console.info('MongoDB disconnected.');
});

export function isDatabaseReady(): boolean {
  return initialized && mongoose.connection.readyState === 1;
}

export async function checkDatabaseReadiness(): Promise<boolean> {
  if (!isDatabaseReady() || !mongoose.connection.db) return false;
  try {
    await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 1_000 });
    return true;
  } catch {
    return false;
  }
}

export async function connectDatabase(uri: string | undefined = env.MONGODB_URI): Promise<void> {
  if (!uri || !/^mongodb(?:\+srv)?:\/\/\S+$/.test(uri)) {
    throw new Error('MONGODB_URI must be configured with a MongoDB connection URI.');
  }
  if (disconnecting) await disconnecting;
  if (activeUri && activeUri !== uri) throw new Error('A different MongoDB connection is already active.');
  if (connecting) return connecting;
  if (isDatabaseReady()) return;
  activeUri = uri;

  connecting = (async () => {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5_000,
        connectTimeoutMS: 5_000,
        socketTimeoutMS: 10_000,
        maxPoolSize: 10,
        autoCreate: false,
        autoIndex: false
      });
      const topology = await mongoose.connection.db!.admin().command({ hello: 1 });
      if (!topology.setName && topology.msg !== 'isdbgrid') {
        throw new Error('Transactions require a replica set or sharded MongoDB cluster.');
      }
      await initializeModels();
      initialized = true;
      if (env.LOG_LEVEL !== 'silent') console.info('MongoDB connected; transactional database is ready.');
    } catch {
      initialized = false;
      activeUri = undefined;
      await mongoose.disconnect().catch(() => undefined);
      // Driver errors can contain credentials or URI fragments. Do not expose a cause.
      throw new Error('MongoDB initialization failed. Check configuration, replica-set topology, and database availability.');
    }
  })();
  try {
    await connecting;
  } finally {
    connecting = undefined;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (disconnecting) return disconnecting;
  disconnecting = (async () => {
    if (connecting) await connecting.catch(() => undefined);
    initialized = false;
    await mongoose.disconnect();
    activeUri = undefined;
  })();
  try {
    await disconnecting;
  } finally {
    disconnecting = undefined;
  }
}

// Attach to future database-backed routers before their controllers.
export const requireDatabase: RequestHandler = async (_req, _res, next) => {
  if (!await checkDatabaseReadiness()) {
    next(new ApiError(503, 'DATABASE_UNAVAILABLE', 'The database is temporarily unavailable.'));
    return;
  }
  next();
};

import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { checkDatabaseReadiness, connectDatabase, isDatabaseReady, requireDatabase } from '../src/config/database.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { requestLogger } from '../src/middleware/request-logger.js';

describe('disconnected database infrastructure', () => {
  it('does not connect when application/model modules are imported', async () => {
    expect(mongoose.connection.readyState).toBe(0);
    expect(isDatabaseReady()).toBe(false);
    expect(await checkDatabaseReadiness()).toBe(false);
  });

  it.each(['', 'https://not-a-mongodb.example'])('requires a MongoDB URI without echoing its value', async (uri) => {
    await expect(connectDatabase(uri)).rejects.toThrow('MONGODB_URI must be configured');
    expect(mongoose.connection.readyState).toBe(0);
  });

  it('rejects a database-dependent handler before it can run', async () => {
    const app = express();
    let executed = false;
    app.use(requestLogger(true));
    app.get('/protected-database-operation', requireDatabase, (_req, res) => {
      executed = true;
      res.json({ success: true });
    });
    app.use(errorHandler(true));
    const response = await request(app).get('/protected-database-operation').expect(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(executed).toBe(false);
  });
});

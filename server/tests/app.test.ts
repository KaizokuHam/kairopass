import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { requestLogger } from '../src/middleware/request-logger.js';

const app = createApp({ mode: 'test', logLevel: 'silent' });

describe('API foundation', () => {
  it('returns the exact liveness contract without a database connection', async () => {
    const response = await request(app).get('/api/health').expect(200).expect('Content-Type', /json/);
    expect(response.body).toEqual({ success: true, message: 'KairoPass API is running' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('generates a new request ID instead of trusting a supplied identifier', async () => {
    const first = await request(app).get('/api/health').set('X-Request-Id', 'untrusted');
    const second = await request(app).get('/api/health');
    expect(first.headers['x-request-id']).toMatch(/^[\da-f-]{36}$/);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('reports database unavailability without changing liveness', async () => {
    const response = await request(app).get('/api/ready').expect(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.headers['cache-control']).toBe('no-store');
    await request(app).get('/api/health').expect(200);
  });

  it.each(['/api', '/api/unknown', '/api/not-implemented'])('returns a JSON API 404 for %s', async (path) => {
    const response = await request(app).get(path).set('Accept', 'text/html').expect(404).expect('Content-Type', /json/);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'API_NOT_FOUND',
        message: 'The requested API endpoint does not exist.',
        requestId: response.headers['x-request-id']
      }
    });
  });

  it.each(['/api/events', '/api/events/000000000000000000000000'])('fails public discovery closed when MongoDB is unavailable (%s)', async (path) => {
    const response = await request(app).get(path).expect(503).expect('Content-Type', /json/);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('rejects malformed JSON with the shared error contract', async () => {
    const response = await request(app).post('/api/unknown').set('Content-Type', 'application/json').send('{oops').expect(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('limits JSON payloads', async () => {
    const response = await request(app).post('/api/unknown').send({ data: 'a'.repeat(33 * 1024) }).expect(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it.each(['charset', 'encoding'])('classifies unsupported request %s as a client media error', async (condition) => {
    const pending = request(app).post('/api/auth/login')
      .set('Content-Type', condition === 'charset' ? 'application/json; charset=iso-8859-1' : 'application/json');
    if (condition === 'encoding') pending.set('Content-Encoding', 'unsupported');
    const response = await pending.send('{}').expect(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.headers['cache-control']).toBe('no-store');
    await request(app).get('/api/health').expect(200);
  });

  it.each(['/api/events/%ZZ', '/api/organizer/events/%E0%A4%A', '/assets/%FF'])('rejects malformed URL encoding before routing (%s)', async (path) => {
    const response = await request(app).get(path).expect(400);
    expect(response.body.error.code).toBe('INVALID_URL');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.error.message).not.toContain(path);
  });

  it('keeps unexpected exception text out of logs as well as HTTP responses', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failingApp = express(); failingApp.use(requestLogger(true));
    failingApp.get('/failure', () => { throw new Error('synthetic-private-diagnostic'); });
    failingApp.use(errorHandler(false));
    const response = await request(failingApp).get('/failure').expect(500);
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      level: 'error', requestId: response.headers['x-request-id'], message: 'Unhandled request error'
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-private-diagnostic');
    expect(response.text).not.toContain('synthetic-private-diagnostic');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('does not expose internal errors or stack traces', async () => {
    const failingApp = express();
    failingApp.use(requestLogger(true));
    failingApp.get('/failure', () => { throw new Error('private-database-details'); });
    failingApp.use(errorHandler(true));
    const response = await request(failingApp).get('/failure').expect(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error.message).toBe('An unexpected error occurred.');
    expect(response.text).not.toContain('private-database-details');
    expect(response.body.error.stack).toBeUndefined();
  });

  it('logs request metadata without query values, cookies, or authorization', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const loggingApp = createApp({ mode: 'test', logLevel: 'info' });
    await request(loggingApp).get('/api/health?token=private-query')
      .set('Authorization', 'Bearer private-auth').set('Cookie', 'session=private-cookie').expect(200);
    expect(log).toHaveBeenCalledOnce();
    const output = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(output)).toMatchObject({ method: 'GET', path: '/api/health', status: 200 });
    expect(output).not.toMatch(/private-query|private-auth|private-cookie/);
  });

  it('allows only the configured development origin through CORS', async () => {
    const developmentApp = createApp({ mode: 'development', clientOrigin: 'http://localhost:5173', logLevel: 'silent' });
    const allowed = await request(developmentApp).get('/api/health').set('Origin', 'http://localhost:5173').expect(200);
    const other = await request(developmentApp).get('/api/health').set('Origin', 'https://untrusted.example').expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(other.headers['access-control-allow-origin']).not.toBe('https://untrusted.example');
  });
});

describe('production single-origin routing', () => {
  const clientDistPath = fileURLToPath(new URL('./fixtures/client/', import.meta.url));
  const productionApp = createApp({ mode: 'production', clientDistPath, logLevel: 'silent' });

  it.each(['/', '/vision', '/some/browser/route'])('serves the SPA for browser navigation to %s', async (path) => {
    const response = await request(productionApp).get(path).set('Accept', 'text/html').expect(200).expect('Content-Type', /html/);
    expect(response.text).toContain('SPA entry fixture');
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('serves built assets', async () => {
    await request(productionApp).get('/assets/app.css').expect(200).expect('Content-Type', /css/);
  });

  it.each(['/assets/missing.css', '/assets/missing'])('does not mask a missing asset at %s with HTML', async (path) => {
    const response = await request(productionApp).get(path).set('Accept', 'text/html').expect(404).expect('Content-Type', /json/);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('keeps the API working and disables production CORS', async () => {
    const health = await request(productionApp).get('/api/health').set('Origin', 'https://untrusted.example').expect(200);
    expect(health.body.success).toBe(true);
    expect(health.headers['access-control-allow-origin']).toBeUndefined();
    const missing = await request(productionApp).get('/api/missing').set('Accept', 'text/html').expect(404).expect('Content-Type', /json/);
    expect(missing.body.error.code).toBe('API_NOT_FOUND');
  });

  it('does not serve the SPA for mutations or non-HTML requests', async () => {
    await request(productionApp).post('/vision').expect(404);
    await request(productionApp).get('/vision').set('Accept', 'application/json').expect(404);
  });

  it('fails clearly when the frontend build is missing', () => {
    expect(() => createApp({ mode: 'production', clientDistPath: `${clientDistPath}/missing` }))
      .toThrow('Frontend build missing. Run npm run build');
  });
});

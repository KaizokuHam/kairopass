import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import request, { type Response } from 'supertest';
import { decodeJwt } from 'jose';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { AuthSession, User } from '../src/models/index.js';
import { hashSessionId, SESSION_COOKIE_NAME } from '../src/modules/auth/auth.tokens.js';
import { verifyPassword } from '../src/modules/auth/auth.passwords.js';
import { useDisposableDatabase } from './helpers/database.js';

const database = useDisposableDatabase();
const origin = 'http://localhost:5173';
const authEnvironment = {
  JWT_SECRET: randomBytes(48).toString('base64url'), CLIENT_ORIGIN: origin,
  APP_ORIGIN: 'http://127.0.0.1:4000', AUTH_LOGIN_MAX_REQUESTS: '1000', AUTH_REGISTER_MAX_REQUESTS: '1000'
};
const registration = {
  name: '  Test Attendee  ', email: '  ATTENDEE@Example.test  ',
  password: 'Test-only StrongPassword123!', role: 'ATTENDEE'
};
let app: ReturnType<typeof createApp>;
beforeEach(() => { app = createApp({ mode: 'test', logLevel: 'silent', authEnvironment }); });

function sessionCookie(response: Response) {
  const headers: unknown = response.headers['set-cookie'];
  const values = Array.isArray(headers) ? headers : [headers];
  const full: unknown = values.find((value: unknown) => typeof value === 'string' && value.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (typeof full !== 'string') throw new Error('Expected authentication Set-Cookie header');
  const pair = full.split(';')[0];
  if (!pair) throw new Error('Expected authentication cookie pair');
  return { full, pair, token: decodeURIComponent(pair.slice(SESSION_COOKIE_NAME.length + 1)) };
}

async function register(overrides: Record<string, unknown> = {}) {
  return request(app).post('/api/auth/register').set('Origin', origin).send({ ...registration, ...overrides });
}

describe('database-backed authentication endpoints', () => {
  it.each(['ATTENDEE', 'ORGANIZER'])('registers and authenticates a real %s account with a safe DTO', async (role) => {
    const response = await register({ role });
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user).toMatchObject({ name: 'Test Attendee', email: 'attendee@example.test', role });
    expect(Object.keys(response.body.data.user).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role', 'updatedAt']);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toContain(registration.password);
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|jtiHash|token/);
    const cookie = sessionCookie(response);
    expect(cookie.full).toContain('HttpOnly');
    expect(cookie.full).toContain('SameSite=Lax');
    expect(cookie.full).toContain('Path=/');
    expect(cookie.full).toContain('Max-Age=');
    expect(cookie.full).not.toContain('Domain=');
    const stored = await User.findById(response.body.data.user.id).select('+passwordHash').orFail();
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(registration.password, stored.passwordHash)).toBe(true);
    const claims = decodeJwt(cookie.token);
    const session = await AuthSession.findOne({ userId: stored._id }).orFail();
    expect(session.jtiHash).toBe(hashSessionId(String(claims.jti)));
    expect(session.toObject()).not.toHaveProperty('jti');
    await request(app).get('/api/auth/me').set('Cookie', cookie.pair).expect(200);
  });

  it('normalizes login email, verifies the stored hash, and creates an independent session', async () => {
    await register();
    const response = await request(app).post('/api/auth/login').set('Origin', origin)
      .send({ email: ' ATTENDEE@EXAMPLE.TEST ', password: registration.password }).expect(200);
    expect(response.body.data.user.email).toBe('attendee@example.test');
    expect(await AuthSession.countDocuments()).toBe(2);
    const current = await request(app).get('/api/auth/me').set('Cookie', sessionCookie(response).pair).expect(200);
    expect(current.body).toEqual({ success: true, data: { user: response.body.data.user } });
  });

  it('rejects duplicate normalized email registration with 409', async () => {
    await register();
    const response = await register({ email: 'attendee@example.test' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_IN_USE');
    expect(await User.countDocuments()).toBe(1);
    expect(await AuthSession.countDocuments()).toBe(1);
  });

  it('uses the same generic login failure for wrong passwords and unknown accounts', async () => {
    await register();
    const wrong = await request(app).post('/api/auth/login').set('Origin', origin)
      .send({ email: 'attendee@example.test', password: 'Wrong test password' }).expect(401);
    const unknown = await request(app).post('/api/auth/login').set('Origin', origin)
      .send({ email: 'unknown@example.test', password: 'Wrong test password' }).expect(401);
    expect(wrong.body.error.message).toBe('Invalid email or password.');
    expect(unknown.body.error.code).toBe(wrong.body.error.code);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(wrong.headers['set-cookie']).toBeUndefined();
    expect(await AuthSession.countDocuments()).toBe(1);
  });

  it('revokes the current session, clears the cookie, and blocks copied-token reuse', async () => {
    const cookie = sessionCookie(await register());
    const response = await request(app).post('/api/auth/logout').set('Origin', origin).set('Cookie', cookie.pair).expect(200);
    const cleared = sessionCookie(response);
    expect(cleared.token).toBe('');
    expect(cleared.full).toContain('Expires=Thu, 01 Jan 1970');
    expect(cleared.full).toContain('HttpOnly');
    expect(cleared.full).toContain('SameSite=Lax');
    expect((await AuthSession.findOne().orFail()).revokedAt).toBeInstanceOf(Date);
    await request(app).get('/api/auth/me').set('Cookie', cookie.pair).expect(401);
    await request(app).post('/api/auth/logout').set('Origin', origin).set('Cookie', cookie.pair).expect(200);
    await request(app).post('/api/auth/logout').set('Origin', origin).expect(200);
  });

  it.each([undefined, `${SESSION_COOKIE_NAME}=malformed`])('rejects missing/invalid authentication cookies (case %#)', async (cookie) => {
    const operation = request(app).get('/api/auth/me');
    if (cookie) operation.set('Cookie', cookie);
    const response = await operation.expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects untrusted-origin mutations before creating users', async () => {
    const response = await request(app).post('/api/auth/register').set('Origin', 'https://untrusted.example')
      .send(registration).expect(403);
    expect(response.body.error.code).toBe('UNTRUSTED_ORIGIN');
    expect(await User.countDocuments()).toBe(0);
  });

  it('fails closed for invalid JWT configuration while leaving liveness available', async () => {
    const disabled = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: { JWT_SECRET: 'weak' } });
    const response = await request(disabled).post('/api/auth/register').set('Origin', origin).send(registration).expect(503);
    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE');
    await request(disabled).get('/api/health').expect(200);
    expect(await User.countDocuments()).toBe(0);
  });

  it('limits login attempts with the consistent JSON error contract', async () => {
    const limited = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: { ...authEnvironment, AUTH_LOGIN_MAX_REQUESTS: '2' } });
    for (let i = 0; i < 2; i++) {
      await request(limited).post('/api/auth/login').set('Origin', origin).send({}).expect(400);
    }
    const response = await request(limited).post('/api/auth/login').set('Origin', origin).send({}).expect(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('returns safe 503 errors when MongoDB is unavailable, preserving liveness', async () => {
    await disconnectDatabase();
    try {
      const response = await request(app).post('/api/auth/register').set('Origin', origin).send(registration).expect(503);
      expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
      await request(app).get('/api/auth/me').expect(503);
      await request(app).get('/api/health').expect(200);
    } finally { await connectDatabase(database.uri); }
  });
});

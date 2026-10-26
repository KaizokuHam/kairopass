import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request, { type Response } from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { SignJWT, decodeJwt } from 'jose';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { AuthSession, User } from '../src/models/index.js';
import { hashSessionId, SESSION_COOKIE_NAME } from '../src/modules/auth/auth.tokens.js';
import { verifyPassword } from '../src/modules/auth/auth.passwords.js';
import { useDisposableDatabase } from './helpers/database.js';
import { parseAuthEnvironment } from '../src/config/auth.js';
import { requireDatabase } from '../src/config/database.js';
import { requireAuth } from '../src/middleware/authenticate.js';
import { requireRole } from '../src/middleware/authorize.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { requestLogger } from '../src/middleware/request-logger.js';

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

function roleHarness() {
  const harness = express();
  const config = parseAuthEnvironment(authEnvironment, 'test');
  harness.use(requestLogger(true));
  harness.get('/organizer-only', requireDatabase, requireAuth(config), requireRole('ORGANIZER'), (_req, res) => res.json({ success: true }));
  harness.get('/both-roles', requireDatabase, requireAuth(config), requireRole('ATTENDEE', 'ORGANIZER'), (_req, res) => res.json({ success: true }));
  harness.get('/missing-auth-context', requireRole('ORGANIZER'), (_req, res) => res.json({ success: true }));
  harness.use(errorHandler(true));
  return harness;
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

describe('strict input validation and registration races', () => {
  it.each([
    { email: 'invalid-email' }, { email: { $ne: null } },
    { password: 'short' }, { password: '🔐'.repeat(4) }, { password: 'x'.repeat(129) }, { password: '漢'.repeat(100) },
    { role: 'ADMIN' }, { role: { $ne: null } },
    { name: ' ' }, { name: 'A' }, { name: 'x'.repeat(101) },
    { isAdmin: true }, { passwordHash: 'untrusted-hash' }, { _id: '507f1f77bcf86cd799439011' }
  ])('rejects invalid or unallowlisted registration input (case %#)', async (change) => {
    const response = await register(change);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toBeInstanceOf(Array);
    expect(await User.countDocuments()).toBe(0);
    expect(await AuthSession.countDocuments()).toBe(0);
  });

  it('defaults an omitted role to ATTENDEE', async () => {
    const response = await register({ role: undefined });
    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe('ATTENDEE');
  });

  it.each([{}, { email: 'valid@example.test' }, { password: registration.password },
    { email: { $ne: null }, password: registration.password },
    { email: 'valid@example.test', password: registration.password, isAdmin: true }
  ])('rejects missing or invalid login fields (case %#)', async (input) => {
    const response = await request(app).post('/api/auth/login').set('Origin', origin).send(input).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects form submissions and malformed JSON while keeping the process healthy', async () => {
    await request(app).post('/api/auth/login').set('Origin', origin).type('form')
      .send({ email: 'attendee@example.test', password: registration.password }).expect(400);
    const malformed = await request(app).post('/api/auth/login').set('Origin', origin)
      .type('json').send('{not valid JSON').expect(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');
    await request(app).get('/api/health').expect(200);
  });

  it('handles concurrent registration without duplicate users or sessions', async () => {
    const responses = await Promise.all([register(), register()]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await User.countDocuments()).toBe(1);
    expect(await AuthSession.countDocuments()).toBe(1);
  });

  it('maps the real unique-index failure to 409 even when the precheck sees stale data', async () => {
    await register();
    vi.spyOn(User, 'exists').mockResolvedValueOnce(null);
    const response = await register();
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_IN_USE');
    expect(await User.countDocuments()).toBe(1);
    expect(await AuthSession.countDocuments()).toBe(1);
  });

  it('rolls registration back if session persistence fails and hides the internal failure', async () => {
    vi.spyOn(AuthSession, 'create').mockRejectedValueOnce(new Error('private-session-storage-failure'));
    const response = await register();
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('private-session-storage-failure');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await User.countDocuments()).toBe(0);
    expect(await AuthSession.countDocuments()).toBe(0);
  });
});

describe('JWT verification and session lifecycle through HTTP', () => {
  it.each(['expired', 'tampered', 'algorithm', 'issuer', 'audience', 'missing-claim'] as const)('rejects %s JWTs with a generic 401', async (condition) => {
    const cookie = sessionCookie(await register());
    const original = decodeJwt(cookie.token);
    const config = parseAuthEnvironment(authEnvironment, 'test');
    const now = Math.floor(Date.now() / 1000);
    let signer = new SignJWT({})
      .setProtectedHeader({ alg: condition === 'algorithm' ? 'HS384' : 'HS256', typ: 'JWT' })
      .setSubject(String(original.sub)).setIssuedAt(now - 600)
      .setExpirationTime(condition === 'expired' ? now - 1 : now + 3600)
      .setIssuer(condition === 'issuer' ? 'wrong-issuer' : config.issuer)
      .setAudience(condition === 'audience' ? 'wrong-audience' : config.audience);
    if (condition !== 'missing-claim') signer = signer.setJti(String(original.jti));
    let token = await signer.sign(config.jwtKey);
    if (condition === 'tampered') {
      const parts = token.split('.');
      const signature = parts[2];
      token = `${parts[0]}.${parts[1]}.${signature?.startsWith('a') ? 'b' : 'a'}${signature?.slice(1)}`;
    }
    const response = await request(app).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE_NAME}=${token}`).expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(response.body.error.message).toBe('Authentication is required.');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each(['revoked', 'expired-record', 'missing-record', 'deleted-user'] as const)('rejects a valid JWT with a %s backing state', async (condition) => {
    const response = await register();
    const cookie = sessionCookie(response);
    if (condition === 'revoked') await AuthSession.updateOne({}, { $set: { revokedAt: new Date() } });
    // Test-only raw fixture update simulates elapsed time; expiry is otherwise immutable.
    if (condition === 'expired-record') await AuthSession.collection.updateOne({}, { $set: { expiresAt: new Date(Date.now() - 60_000) } });
    if (condition === 'missing-record') await AuthSession.deleteMany({});
    if (condition === 'deleted-user') await User.deleteOne({ _id: response.body.data.user.id });
    await request(app).get('/api/auth/me').set('Cookie', cookie.pair).expect(401);
  });

  it('rejects ambiguous duplicate cookies and ignores bearer tokens', async () => {
    const cookie = sessionCookie(await register());
    await request(app).get('/api/auth/me').set('Cookie', `${cookie.pair}; ${cookie.pair}`).expect(401);
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${cookie.token}`).expect(401);
  });

  it('revokes only the current session and leaves another login active', async () => {
    const first = sessionCookie(await register());
    const second = sessionCookie(await request(app).post('/api/auth/login').set('Origin', origin)
      .send({ email: 'attendee@example.test', password: registration.password }).expect(200));
    await request(app).post('/api/auth/logout').set('Origin', origin).set('Cookie', first.pair).expect(200);
    await request(app).get('/api/auth/me').set('Cookie', first.pair).expect(401);
    await request(app).get('/api/auth/me').set('Cookie', second.pair).expect(200);
    expect(await AuthSession.countDocuments({ revokedAt: null })).toBe(1);
    expect(await AuthSession.countDocuments({ revokedAt: { $ne: null } })).toBe(1);
  });

  it('verifies session unique and TTL indexes while reservation history remains separate', async () => {
    await register();
    const indexes = await AuthSession.collection.listIndexes().toArray();
    expect(indexes.find((index) => index.name === 'auth_session_jti_unique')?.unique).toBe(true);
    expect(indexes.find((index) => index.name === 'auth_session_expiration')?.expireAfterSeconds).toBe(0);
    const existing = await AuthSession.findOne().orFail();
    await expect(AuthSession.create({ userId: existing.userId, jtiHash: existing.jtiHash, expiresAt: existing.expiresAt }))
      .rejects.toMatchObject({ code: 11000 });
  });
});

describe('current persisted roles (isolated test routes only)', () => {
  it('accepts organizers, blocks attendees, and accepts either permitted role', async () => {
    const attendee = sessionCookie(await register());
    const organizer = sessionCookie(await register({ email: 'organizer@example.test', role: 'ORGANIZER' }));
    const harness = roleHarness();
    await request(harness).get('/organizer-only').set('Cookie', organizer.pair).expect(200);
    await request(harness).get('/organizer-only').set('Cookie', attendee.pair).expect(403);
    await request(harness).get('/both-roles').set('Cookie', attendee.pair).expect(200);
    await request(harness).get('/both-roles').set('Cookie', organizer.pair).expect(200);
  });

  it('returns 401 without authentication or without an attached auth context', async () => {
    const harness = roleHarness();
    await request(harness).get('/organizer-only').expect(401);
    await request(harness).get('/missing-auth-context').expect(401);
  });

  it('respects promotion and demotion immediately with the same JWT', async () => {
    const response = await register();
    const cookie = sessionCookie(response);
    const harness = roleHarness();
    const id = response.body.data.user.id;
    await request(harness).get('/organizer-only').set('Cookie', cookie.pair).expect(403);
    await User.updateOne({ _id: id }, { $set: { role: 'ORGANIZER' } }, { runValidators: true });
    await request(harness).get('/organizer-only').set('Cookie', cookie.pair).expect(200);
    const current = await request(app).get('/api/auth/me').set('Cookie', cookie.pair).expect(200);
    expect(current.body.data.user.role).toBe('ORGANIZER');
    await User.updateOne({ _id: id }, { $set: { role: 'ATTENDEE' } }, { runValidators: true });
    await request(harness).get('/organizer-only').set('Cookie', cookie.pair).expect(403);
  });
});

describe('request defenses and safe failures', () => {
  it.each([undefined, 'null', 'https://untrusted.example', 'http://localhost:5173.evil.example', 'http://localhost:5173/'])('rejects absent, opaque, or untrusted mutation origins (case %#)', async (value) => {
    const operation = request(app).post('/api/auth/register').send(registration);
    if (value !== undefined) operation.set('Origin', value);
    const response = await operation.expect(403);
    expect(response.body.error.code).toBe('UNTRUSTED_ORIGIN');
    expect(await User.countDocuments()).toBe(0);
  });

  it.each([origin, 'http://127.0.0.1:4000'])('accepts the explicitly configured development origin %s', async (value) => {
    await request(app).post('/api/auth/register').set('Origin', value).send(registration).expect(201);
  });

  it('does not derive trusted origins from spoofed Host or forwarding headers', async () => {
    await request(app).post('/api/auth/register').set('Host', 'untrusted.example').set('X-Forwarded-Host', 'untrusted.example')
      .set('Origin', 'http://untrusted.example').send(registration).expect(403);
    expect(await User.countDocuments()).toBe(0);
  });

  it('blocks logout CSRF without revoking the session or clearing its cookie', async () => {
    const cookie = sessionCookie(await register());
    const response = await request(app).post('/api/auth/logout').set('Origin', 'https://untrusted.example')
      .set('Cookie', cookie.pair).expect(403);
    expect(response.headers['set-cookie']).toBeUndefined();
    await request(app).get('/api/auth/me').set('Cookie', cookie.pair).expect(200);
    expect(await AuthSession.countDocuments({ revokedAt: null })).toBe(1);
  });

  it('uses credentialed CORS for the exact configured development origin', async () => {
    const development = createApp({ mode: 'development', logLevel: 'silent', authEnvironment, clientOrigin: origin });
    const response = await request(development).options('/api/auth/login').set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type').expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    const untrusted = await request(development).post('/api/auth/login').set('Origin', 'https://untrusted.example').send({}).expect(403);
    expect(untrusted.headers['access-control-allow-origin']).not.toBe('https://untrusted.example');
  });

  it('enforces the production HTTPS origin and consistent Secure cookie set/clear options', async () => {
    const productionOrigin = 'https://app.example.test';
    const production = createApp({
      mode: 'production', logLevel: 'silent',
      clientDistPath: fileURLToPath(new URL('./fixtures/client/', import.meta.url)),
      authEnvironment: { ...authEnvironment, APP_ORIGIN: productionOrigin, COOKIE_SECURE: 'false' }
    });
    await request(production).post('/api/auth/register').set('Origin', origin).send(registration).expect(403);
    const response = await request(production).post('/api/auth/register').set('Origin', productionOrigin).send(registration).expect(201);
    const cookie = sessionCookie(response);
    expect(cookie.full).toContain('; Secure');
    expect(cookie.full).toContain('; HttpOnly');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    const logout = await request(production).post('/api/auth/logout').set('Origin', productionOrigin).set('Cookie', cookie.pair).expect(200);
    const cleared = sessionCookie(logout);
    expect(cleared.full).toContain('; Secure');
    expect(cleared.full).toContain('; HttpOnly');
    expect(cleared.full).toContain('SameSite=Lax');
    expect(cleared.full).toContain('Path=/');
    expect(cleared.full).not.toContain('Domain=');
  });

  it.each(['register', 'login'])('rate-limits %s and ignores spoofed forwarding IPs', async (endpoint) => {
    const limited = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: {
      ...authEnvironment, AUTH_LOGIN_MAX_REQUESTS: '2', AUTH_REGISTER_MAX_REQUESTS: '2'
    } });
    expect(limited.get('trust proxy')).toBe(false);
    for (let attempt = 0; attempt < 2; attempt++) {
      await request(limited).post(`/api/auth/${endpoint}`).set('Origin', origin)
        .set('X-Forwarded-For', `192.0.2.${attempt + 1}`).send({}).expect(400);
    }
    const response = await request(limited).post(`/api/auth/${endpoint}`).set('Origin', origin)
      .set('X-Forwarded-For', '192.0.2.99').send({}).expect(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBeDefined();
    expect(response.headers['ratelimit']).toBeDefined();
  });

  it('maps a connection drop during login to a safe 503 response', async () => {
    vi.spyOn(mongoose.Query.prototype, 'exec').mockRejectedValueOnce(new mongoose.mongo.MongoNetworkError('private-driver-credential-detail'));
    const response = await request(app).post('/api/auth/login').set('Origin', origin)
      .send({ email: 'attendee@example.test', password: registration.password }).expect(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('private-driver-credential-detail');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('keeps credentials, hashes, cookie values, and signing secrets out of request logs', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const loggingApp = createApp({ mode: 'test', logLevel: 'info', authEnvironment });
    const response = await request(loggingApp).post('/api/auth/register').set('Origin', origin).send(registration).expect(201);
    const output = JSON.stringify(log.mock.calls);
    expect(log).toHaveBeenCalled();
    expect(output).not.toContain(registration.password);
    expect(output).not.toContain(authEnvironment.JWT_SECRET);
    expect(output).not.toContain(sessionCookie(response).token);
    expect(output).not.toMatch(/passwordHash|jtiHash|set-cookie/i);
  });

  it('disables all four authentication endpoints without a signing secret', async () => {
    const disabled = createApp({ mode: 'test', logLevel: 'silent', authEnvironment: {} });
    await request(disabled).post('/api/auth/register').set('Origin', origin).send(registration).expect(503);
    await request(disabled).post('/api/auth/login').set('Origin', origin).send({}).expect(503);
    await request(disabled).get('/api/auth/me').expect(503);
    await request(disabled).post('/api/auth/logout').set('Origin', origin).expect(503);
    await request(disabled).get('/api/health').expect(200);
    expect(await User.countDocuments()).toBe(0);
  });
});

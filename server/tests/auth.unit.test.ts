import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SignJWT, decodeJwt } from 'jose';
import { parseAuthEnvironment } from '../src/config/auth.js';
import { hashPassword, verifyPassword } from '../src/modules/auth/auth.passwords.js';
import { createSessionMaterial, hashSessionId, sessionCookieOptions, verifySessionToken } from '../src/modules/auth/auth.tokens.js';

const secret = randomBytes(48).toString('base64url');
const config = parseAuthEnvironment({ JWT_SECRET: secret }, 'test');
const subject = '507f1f77bcf86cd799439011';

describe('authentication configuration', () => {
  it('uses a 12-hour lifetime and only explicitly configured origins', () => {
    expect(config.lifetimeSeconds).toBe(43_200);
    expect([...config.allowedOrigins]).toEqual(['http://127.0.0.1:4000', 'http://localhost:5173']);
    expect(config.loginLimit).toBe(10);
    expect(config.registerLimit).toBe(5);
  });

  it.each([undefined, '', 'short', 'a'.repeat(64), 'REPLACE_WITH_A_RANDOM_SECRET_BEFORE_AUTHENTICATION'])('rejects missing, weak, or placeholder secrets without exposing their value (case %#)', (value) => {
      const input: NodeJS.ProcessEnv = {};
      if (value !== undefined) input.JWT_SECRET = value;
      expect(() => parseAuthEnvironment(input)).toThrow('Invalid authentication configuration: JWT_SECRET');
    });

  it.each(['1s', '0h', '8d', 'forever'])('rejects an unsafe lifetime %s', (JWT_EXPIRES_IN) => {
    expect(() => parseAuthEnvironment({ JWT_SECRET: secret, JWT_EXPIRES_IN })).toThrow('JWT_EXPIRES_IN');
  });

  it('requires HTTPS production origins and always enables Secure cookies', () => {
    expect(() => parseAuthEnvironment({ JWT_SECRET: secret }, 'production')).toThrow('HTTPS origin');
    expect(() => parseAuthEnvironment({ JWT_SECRET: secret, APP_ORIGIN: 'http://example.test' }, 'production')).toThrow('HTTPS origin');
    const production = parseAuthEnvironment({ JWT_SECRET: secret, APP_ORIGIN: 'https://app.example.test', COOKIE_SECURE: 'false' }, 'production');
    expect([...production.allowedOrigins]).toEqual(['https://app.example.test']);
    expect(sessionCookieOptions(production)).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    expect(sessionCookieOptions(config).secure).toBe(false);
  });
});

describe('Argon2id password security', () => {
  it('uses independent salts and verifies passwords without trimming them', async () => {
    const password = ` ${randomBytes(16).toString('base64url')} `;
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).toMatch(/^\$argon2id\$v=19\$/);
    expect(first.split('$')[3]?.split(',').sort()).toEqual(['m=19456', 'p=1', 't=2']);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(password.trim(), first)).toBe(false);
    expect(await verifyPassword(password)).toBe(false);
    expect(await verifyPassword(password, 'invalid-stored-hash')).toBe(false);
  });
});

describe('JWT/session primitives', () => {
  it('creates minimal claims, random identifiers, and only hashed identifiers for storage', async () => {
    const first = await createSessionMaterial(subject, config);
    const second = await createSessionMaterial(subject, config);
    const claims = await verifySessionToken(first.token, config);
    if (!claims) throw new Error('Expected valid signed claims');
    expect(claims?.sub).toBe(subject);
    expect(Object.keys(decodeJwt(first.token)).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'jti', 'sub']);
    expect(claims.exp - claims.iat).toBe(config.lifetimeSeconds);
    expect(first.expiresAt.getTime()).toBe(claims.exp * 1000);
    expect(first.jtiHash).toBe(hashSessionId(claims.jti));
    expect(first.jtiHash).not.toBe(claims.jti);
    expect(first.jtiHash).not.toBe(second.jtiHash);
    expect(first).not.toHaveProperty('jti');
  });

  it('rejects absent, malformed, and tampered tokens', async () => {
    const session = await createSessionMaterial(subject, config);
    const [header, payload, signature] = session.token.split('.');
    const tampered = `${header}.${payload}.${signature?.startsWith('a') ? 'b' : 'a'}${signature?.slice(1)}`;
    for (const value of [undefined, '', 'not-a-token', 'x'.repeat(4097), tampered]) {
      expect(await verifySessionToken(value, config)).toBeNull();
    }
  });

  it.each(['expired', 'algorithm', 'issuer', 'audience', 'missing-claim', 'future-iat', 'excessive-lifetime'] as const)('rejects %s tokens', async (condition) => {
      const now = Math.floor(Date.now() / 1000);
      let signer = new SignJWT({})
        .setProtectedHeader({ alg: condition === 'algorithm' ? 'HS384' : 'HS256', typ: 'JWT' })
        .setSubject(subject).setIssuedAt(condition === 'future-iat' ? now + 3600 : now - 10)
        .setExpirationTime(condition === 'expired' ? now - 1 : now + (condition === 'excessive-lifetime' ? 604800 : 3600))
        .setIssuer(condition === 'issuer' ? 'different-issuer' : config.issuer)
        .setAudience(condition === 'audience' ? 'different-audience' : config.audience);
      if (condition !== 'missing-claim') signer = signer.setJti(randomBytes(32).toString('base64url'));
      expect(await verifySessionToken(await signer.sign(config.jwtKey), config)).toBeNull();
    });
});

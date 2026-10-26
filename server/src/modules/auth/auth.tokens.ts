import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { CookieOptions } from 'express';
import { z } from 'zod';
import { parseCookie } from 'cookie';
import type { AuthConfig } from '../../config/auth.js';

export const SESSION_COOKIE_NAME = 'kairopass_session';

export function readSessionCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  // Ambiguous duplicate names can come from cookie tossing. Never pick one arbitrarily.
  const matches = header.split(';').filter((part) => {
    const separator = part.indexOf('=');
    return separator >= 0 && part.slice(0, separator).trim() === SESSION_COOKIE_NAME;
  });
  if (matches.length !== 1) return undefined;
  return parseCookie(header)[SESSION_COOKIE_NAME];
}
const claimsSchema = z.object({
  sub: z.string().regex(/^[a-f0-9]{24}$/),
  jti: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  iss: z.string(),
  aud: z.string()
}).strict();
export type SessionClaims = z.infer<typeof claimsSchema>;

export function hashSessionId(jti: string): string {
  return createHash('sha256').update(jti).digest('hex');
}

export async function createSessionMaterial(userId: string, config: AuthConfig) {
  const jti = randomBytes(32).toString('base64url');
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiration = issuedAt + config.lifetimeSeconds;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId).setJti(jti).setIssuedAt(issuedAt).setExpirationTime(expiration)
    .setIssuer(config.issuer).setAudience(config.audience).sign(config.jwtKey);
  return { token, jtiHash: hashSessionId(jti), expiresAt: new Date(expiration * 1000) };
}

export async function verifySessionToken(token: string | undefined, config: AuthConfig): Promise<SessionClaims | null> {
  if (!token || token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, config.jwtKey, {
      algorithms: ['HS256'], typ: 'JWT', issuer: config.issuer, audience: config.audience,
      requiredClaims: ['sub', 'jti', 'iat', 'exp', 'iss', 'aud'], maxTokenAge: config.lifetimeSeconds
    });
    const result = claimsSchema.safeParse(payload);
    if (!result.success || result.data.exp <= result.data.iat ||
      result.data.exp - result.data.iat > config.lifetimeSeconds) return null;
    return result.data;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(config: AuthConfig): CookieOptions {
  return { httpOnly: true, secure: config.secureCookies, sameSite: 'lax', path: '/' };
}

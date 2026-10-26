import { z } from 'zod';
import { httpOriginSchema, parseEnvironment } from './env.js';

const secretSchema = z.string().min(43).max(512).regex(/^[A-Za-z0-9_-]+$/).refine((value) => {
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length >= 32 && bytes.toString('base64url') === value &&
    new Set(value).size >= 12 && !/replace|changeme|example|your.?secret/i.test(value);
}, 'JWT_SECRET must be generated from at least 32 random bytes encoded as unpadded base64url');

function lifetimeSeconds(value: string): number {
  const match = /^(\d{1,6})([smhd])$/.exec(value);
  if (!match) return 0;
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  return Number(match[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
}

const authEnvironmentSchema = z.object({
  JWT_SECRET: secretSchema,
  JWT_EXPIRES_IN: z.string().default('12h').transform(lifetimeSeconds)
    .refine((seconds) => seconds >= 60 && seconds <= 7 * 86400, 'JWT lifetime must be between 60 seconds and 7 days, using s/m/h/d'),
  JWT_ISSUER: z.string().trim().min(1).max(100).default('kairopass-api'),
  JWT_AUDIENCE: z.string().trim().min(1).max(100).default('kairopass-web'),
  APP_ORIGIN: httpOriginSchema.optional(),
  AUTH_LOGIN_MAX_REQUESTS: z.coerce.number().int().min(1).max(1000).default(10),
  AUTH_REGISTER_MAX_REQUESTS: z.coerce.number().int().min(1).max(1000).default(5)
});

export interface AuthConfig {
  readonly jwtKey: Uint8Array;
  readonly lifetimeSeconds: number;
  readonly issuer: string;
  readonly audience: string;
  readonly secureCookies: boolean;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly loginLimit: number;
  readonly registerLimit: number;
}

export function parseAuthEnvironment(input: NodeJS.ProcessEnv, mode?: 'development' | 'test' | 'production'): AuthConfig {
  const runtime = parseEnvironment(input);
  const result = authEnvironmentSchema.safeParse(input);
  if (!result.success) {
    // Never include supplied configuration values, including secrets, in diagnostics.
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid authentication configuration: ${keys.join(', ')}. See .env.example.`);
  }
  const settings = result.data;
  const production = (mode ?? runtime.NODE_ENV) === 'production';
  if (production && !settings.APP_ORIGIN?.startsWith('https://')) {
    throw new Error('Invalid authentication configuration: production APP_ORIGIN must be an explicit HTTPS origin.');
  }
  const appOrigin = settings.APP_ORIGIN ?? `http://127.0.0.1:${runtime.PORT}`;
  return {
    jwtKey: Buffer.from(settings.JWT_SECRET, 'base64url'),
    lifetimeSeconds: settings.JWT_EXPIRES_IN,
    issuer: settings.JWT_ISSUER,
    audience: settings.JWT_AUDIENCE,
    secureCookies: production,
    allowedOrigins: new Set(production ? [appOrigin] : [appOrigin, runtime.CLIENT_ORIGIN]),
    loginLimit: settings.AUTH_LOGIN_MAX_REQUESTS,
    registerLimit: settings.AUTH_REGISTER_MAX_REQUESTS
  };
}

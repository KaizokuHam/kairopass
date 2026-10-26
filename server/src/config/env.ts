import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

export const httpOriginSchema = z.url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
}, 'Must be an HTTP(S) origin without a path or trailing slash');

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: httpOriginSchema.default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['info', 'silent']).default('info'),
  // Optional for liveness-only use. connectDatabase requires this before connecting.
  MONGODB_URI: z.string().trim().regex(/^mongodb(?:\+srv)?:\/\/\S+$/, 'Must be a MongoDB connection URI').optional()
});

export function parseEnvironment(input: NodeJS.ProcessEnv) {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    // Report keys and validation failures, never the supplied environment values.
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration: ${issues.join('; ')}`);
  }
  return result.data;
}

export const env = parseEnvironment(process.env);

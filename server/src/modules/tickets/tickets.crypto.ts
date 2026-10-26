import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export interface TicketConfig { readonly key: Buffer }
export interface TicketPayload { readonly v: 1; readonly ticketId: string; readonly nonce: string }
const nonceSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/).refine((v) => Buffer.from(v, 'base64url').toString('base64url') === v);
const payloadSchema = z.object({ v: z.literal(1), ticketId: z.string().regex(/^[a-f\d]{24}$/), nonce: nonceSchema }).strict();
const domain = 'KairoPass.ticket.v1.';
export const MAX_TICKET_PAYLOAD_LENGTH = 512;

/** Separate credential: configuration errors never include supplied values. */
export function parseTicketEnvironment(input: NodeJS.ProcessEnv): TicketConfig {
  const value = input.TICKET_HMAC_SECRET ?? '';
  const key = Buffer.from(value, 'base64url');
  if (value.length < 43 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value) || key.length < 32 ||
    key.toString('base64url') !== value || new Set(value).size < 12 || /replace|changeme|example|your.?secret/i.test(value) ||
    key.equals(Buffer.from(input.JWT_SECRET ?? '', 'base64url'))) {
    throw new Error('Invalid ticket configuration: generate an independent TICKET_HMAC_SECRET. See .env.example.');
  }
  return { key };
}
export function validTicketNonce(value: unknown): value is string { return nonceSchema.safeParse(value).success; }
function canonical(payload: TicketPayload) { return JSON.stringify({ v: payload.v, ticketId: payload.ticketId, nonce: payload.nonce }); }
function signature(encoded: string, config: TicketConfig) { return createHmac('sha256', config.key).update(domain + encoded, 'ascii').digest(); }
export function signTicket(payload: TicketPayload, config: TicketConfig): string {
  const parsed = payloadSchema.parse(payload);
  const encoded = Buffer.from(canonical(parsed), 'utf8').toString('base64url');
  return encoded + '.' + signature(encoded, config).toString('base64url');
}
/** Authenticity only. Admission must separately validate the live database state. */
export function verifyTicket(input: unknown, config: TicketConfig): TicketPayload | null {
  if (typeof input !== 'string' || input.length > MAX_TICKET_PAYLOAD_LENGTH) return null;
  const segments = input.split('.');
  if (segments.length !== 2) return null;
  const [encoded, supplied] = segments;
  if (!encoded || !supplied || !/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[A-Za-z0-9_-]{43}$/.test(supplied)) return null;
  const bytes = Buffer.from(encoded, 'base64url'), mac = Buffer.from(supplied, 'base64url');
  if (bytes.toString('base64url') !== encoded || mac.length !== 32 || mac.toString('base64url') !== supplied) return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(bytes.toString('utf8')) as unknown);
    if (!parsed.success || !bytes.equals(Buffer.from(canonical(parsed.data), 'utf8'))) return null;
    if (!timingSafeEqual(mac, signature(encoded, config))) return null;
    return parsed.data;
  } catch { return null; }
}

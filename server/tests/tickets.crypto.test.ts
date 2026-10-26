import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseTicketEnvironment, signTicket, verifyTicket, type TicketPayload } from '../src/modules/tickets/tickets.crypto.js';

const environment = () => ({ JWT_SECRET: randomBytes(48).toString('base64url'), TICKET_HMAC_SECRET: randomBytes(48).toString('base64url') });
const config = parseTicketEnvironment(environment());
const payload: TicketPayload = { v: 1, ticketId: randomBytes(12).toString('hex'), nonce: randomBytes(32).toString('base64url') };
const raw = (value: string) => { const encoded = Buffer.from(value).toString('base64url'); return encoded + '.' + createHmac('sha256', config.key).update('KairoPass.ticket.v1.' + encoded).digest('base64url'); };
describe('versioned ticket signing', () => {
  it('round trips exactly, deterministically and with distinct backend nonces', () => {
    const signed = signTicket(payload, config);
    expect(verifyTicket(signed, config)).toEqual(payload); expect(signTicket(payload, config)).toBe(signed);
    expect(signTicket({ ...payload, nonce: randomBytes(32).toString('base64url') }, config)).not.toBe(signed);
    expect(verifyTicket(signed, parseTicketEnvironment(environment()))).toBeNull();
  });
  it.each(['ticketId', 'nonce', 'v'] as const)('rejects tampering with %s under the original signature', (field) => {
    const signed = signTicket(payload, config), changed = { ...payload, [field]: field === 'v' ? 2 : field === 'nonce' ? randomBytes(32).toString('base64url') : randomBytes(12).toString('hex') };
    expect(verifyTicket(Buffer.from(JSON.stringify(changed)).toString('base64url') + '.' + signed.split('.')[1], config)).toBeNull();
  });
  it.each([null, {}, 1, '', '.', 'a.b.c', 'x'.repeat(513), 'e30=.abc', 'e30.+/=', 'e30.YQ', 'e30.' + 'A'.repeat(44), 'e30.' + 'A'.repeat(42)])('fails closed on malformed input %#', (input) => {
    expect(verifyTicket(input, config)).toBeNull();
  });
  it('rejects missing or altered signatures including same-length tampering', () => {
    const signed = signTicket(payload, config), [body, mac] = signed.split('.');
    expect(verifyTicket(body, config)).toBeNull();
    expect(verifyTicket(body + '.' + (mac!.startsWith('A') ? 'B' : 'A') + mac!.slice(1), config)).toBeNull();
    expect(verifyTicket(body + '.' + randomBytes(31).toString('base64url'), config)).toBeNull();
  });
  it.each(['{', 'null', '[]', '{}', JSON.stringify({ ...payload, v: 2 }), JSON.stringify({ ...payload, extra: true }),
    JSON.stringify({ ...payload, nonce: 'A'.repeat(42) }), JSON.stringify({ ...payload, ticketId: 'INVALID' }),
    JSON.stringify({ nonce: payload.nonce, v: 1, ticketId: payload.ticketId }), ' ' + JSON.stringify(payload),
    JSON.stringify(payload).replace('"v":1', '"v":1,"v":1')])('rejects even valid signatures over noncanonical or unsupported JSON %#', (input) => {
    expect(verifyTicket(raw(input), config)).toBeNull();
  });
  it.each([undefined, '', 'replace-with-secret', 'a'.repeat(64), 'YWJj', 'A'.repeat(43), randomBytes(32).toString('base64')])('rejects invalid configuration %# without leaking it', (value) => {
    const input = { ...environment(), TICKET_HMAC_SECRET: value };
    expect(() => parseTicketEnvironment(input)).toThrow('Invalid ticket configuration');
  });
  it('requires independent secrets and canonical unpadded encoding', () => {
    const env = environment(); expect(() => parseTicketEnvironment({ ...env, TICKET_HMAC_SECRET: env.JWT_SECRET })).toThrow();
    expect(() => parseTicketEnvironment({ ...env, TICKET_HMAC_SECRET: env.TICKET_HMAC_SECRET + '=' })).toThrow();
    expect(parseTicketEnvironment(env).key.length).toBe(48);
  });
});

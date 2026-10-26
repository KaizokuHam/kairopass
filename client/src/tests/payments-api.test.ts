import { describe, expect, it, vi } from 'vitest';
import { paymentsApi } from '@/services/payments';
import { held } from './reservations-fixtures';
import { confirmed, failedPayment, paymentHistory, paymentKey, paymentResponse, pendingPayment, successPayment } from './payments-fixtures';
import { failure, json } from './fixtures';
const signal = () => new AbortController().signal;
describe('typed simulated payment API', () => {
  it('sends only the simulation outcome and original key through the same-origin client', async () => {
    const fetcher = vi.fn(() => Promise.resolve(paymentResponse())); vi.stubGlobal('fetch', fetcher);
    expect((await paymentsApi.process(held.id, paymentKey, 'SUCCESS', signal())).payment).toEqual(successPayment);
    expect(fetcher.mock.calls[0]).toMatchObject(['/api/reservations/' + held.id + '/payments', {
      method: 'POST', credentials: 'same-origin', body: JSON.stringify({ simulationOutcome: 'SUCCESS' }), headers: { 'Idempotency-Key': paymentKey }
    }]);
  });
  it('queries exact-key history and individual attempt recovery without mutation', async () => {
    const fetcher = vi.fn((path: string) => Promise.resolve(path.includes('?') ? paymentHistory([successPayment], {}, confirmed) : paymentResponse())); vi.stubGlobal('fetch', fetcher);
    await paymentsApi.history(held.id, 1, signal(), paymentKey); await paymentsApi.get(held.id, successPayment.id, signal());
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/reservations/' + held.id + '/payments?page=1&limit=10&idempotencyKey=' + paymentKey, '/api/reservations/' + held.id + '/payments/' + successPayment.id]);
  });
  it.each([
    { ...successPayment, userId: 'private' }, { ...successPayment, amountPaise: -1 }, { ...successPayment, amountPaise: 1.5 },
    { ...successPayment, simulated: false }, { ...successPayment, status: 'PAID' }, { ...successPayment, createdAt: 'invalid' },
    { ...successPayment, reservationId: 'different' }, { ...successPayment, failureReason: 'private server detail' },
    { ...pendingPayment, completedAt: successPayment.completedAt }
  ])('rejects invalid or unsafe payment DTO %#', async (payment) => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ success: true, data: { payment, reservation: confirmed, serverNow: held.createdAt } }))));
    await expect(paymentsApi.get(held.id, successPayment.id, signal())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('rejects success without a corresponding confirmed reservation', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(paymentResponse(successPayment, held))));
    await expect(paymentsApi.get(held.id, successPayment.id, signal())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('accepts a historical failed attempt after another attempt confirmed the reservation', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(paymentResponse(failedPayment, confirmed))));
    expect((await paymentsApi.get(held.id, failedPayment.id, signal())).payment.status).toBe('FAILED');
  });
  it('preserves safe conflict codes without displaying raw backend messages', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(failure(409, 'PAYMENT_IDEMPOTENCY_CONFLICT'))));
    await expect(paymentsApi.process(held.id, paymentKey, 'FAILURE', signal())).rejects.toMatchObject({ code: 'PAYMENT_IDEMPOTENCY_CONFLICT', message: expect.stringContaining('original payment status') });
  });
  it('rejects incorrect pagination totals', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(paymentHistory([], { total: 2, totalPages: 1 }))));
    await expect(paymentsApi.history(held.id, 1, signal())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('does not send malformed resource IDs', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(() => paymentsApi.get('bad', 'bad', signal())).toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps safe legacy transaction references readable without inventing their missing request metadata', async () => {
    const legacy = { ...failedPayment, transactionId: 'legacy_tx_01', simulationOutcome: null, completedAt: null, failureReason: 'UNKNOWN_FAILURE' };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(paymentResponse(legacy, held))));
    expect((await paymentsApi.get(held.id, legacy.id, signal())).payment).toEqual(legacy);
  });
});

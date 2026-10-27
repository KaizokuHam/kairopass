import { describe, expect, it } from 'vitest';
import { amount, count, mapMetrics, mapReport, rate } from '../src/modules/analytics/analytics.mapper.js';
describe('analytics numeric integrity', () => {
  it.each([Number.MAX_SAFE_INTEGER + 1, -1, Infinity, NaN, '1'])('fails closed for invalid count %s', (value) => { expect(() => count(value)).toThrow(); });
  it.each(['1.2', '-1', '1E+35', '00', '9'.repeat(35)])('fails closed for invalid monetary total %s', (value) => { expect(() => amount(value)).toThrow(); });
  it('preserves integer monetary strings beyond number precision', () => { expect(amount('18014398509531882')).toBe('18014398509531882'); });
  it('returns N/A for absent or inconsistent denominators without clamping', () => { expect(rate(0, 0)).toBeNull(); expect(rate(2, 1)).toBeNull(); expect(rate(1, 3)).toBe(33.33); });
  it('rejects impossible persisted inventory rather than displaying negative remaining capacity', () => { expect(() => mapMetrics({ c_capacity: 1, c_occupiedCapacity: 2 })).toThrow(); });
  it('does not interpret a missing aggregate envelope as zero activity', () => {
    const from = new Date('2026-10-26T00:00:00Z'), to = new Date('2026-10-27T00:00:00Z');
    expect(() => mapReport(undefined, { from, to, generatedAt: to, bucketMs: 86400000 }, 1, 10)).toThrow();
  });
});

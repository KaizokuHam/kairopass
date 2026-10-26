import { describe, expect, it } from 'vitest';
import { formatPrice, localDateTimeToIso, paiseToRupees, rupeesToPaise, toLocalDateTime } from '@/lib/event-format';
import { initialEventValues, validateEventForm } from '@/lib/event-form';
import { sampleEvent } from './events-fixtures';

describe('exact paise and local event dates', () => {
  it.each([['199.00', 19900], ['0.00', 0], ['0.29', 29], ['12.3', 1230], ['90071992547409.91', Number.MAX_SAFE_INTEGER]])('converts %s exactly', (text, amount) => {
    expect(rupeesToPaise(text as string)).toBe(amount);
    expect(rupeesToPaise(paiseToRupees(amount as number))).toBe(amount);
  });
  it.each(['-1', '1.001', '1e2', '', 'NaN', '90071992547409.92'])('rejects unsafe currency %s', (value) => expect(rupeesToPaise(value)).toBeNull());
  it('formats Indian grouping while preserving the last paise at the safe integer bound', () => {
    expect(formatPrice(19900)).toBe('₹199.00');
    expect(formatPrice(Number.MAX_SAFE_INTEGER)).toBe('₹9,00,71,99,25,47,409.91');
  });
  it.each(['2040-02-10T00:15:00.000Z', '2040-12-31T23:59:34.123Z'])('round-trips %s in the host local timezone without losing precision', (iso) => {
    expect(localDateTimeToIso(toLocalDateTime(iso))).toBe(iso);
  });
  it('interprets a wall time as local time and rejects impossible calendar inputs', () => {
    expect(localDateTimeToIso('2040-02-10T15:30')).toBe(new Date(2040, 1, 10, 15, 30).toISOString());
    expect(localDateTimeToIso('2040-02-30T15:30')).toBeNull();
    expect(localDateTimeToIso('2040-02-10T15:30Z')).toBeNull();
  });
  it.each([
    { capacity: '-1' }, { capacity: '1.5' }, { pricePaise: '-1' }, { endAt: '2039-01-01T10:00' },
    { registrationDeadline: '2041-01-01T10:00' }, { startAt: '2020-01-01T10:00' }
  ])('validates complete draft state (case %#)', (changes) => {
    expect(validateEventForm({ ...initialEventValues(sampleEvent), ...changes }).input).toBeNull();
  });
});

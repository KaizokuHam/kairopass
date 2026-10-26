import { describe, expect, it } from 'vitest';
import { admissionWindow, requireOpenAdmission } from '../src/modules/checkin/checkin.policy.js';
const event = { startAt: new Date('2040-02-10T18:00:00Z'), endAt: new Date('2040-02-10T21:00:00Z'), status: 'PUBLISHED' as const };
describe('central admission window: opens inclusive, closes exclusive', () => {
  it.each([
    ['2040-02-10T15:59:59.999Z', 'NOT_OPEN'], ['2040-02-10T16:00:00Z', 'OPEN'],
    ['2040-02-10T18:00:00Z', 'OPEN'], ['2040-02-10T20:59:59.999Z', 'OPEN'],
    ['2040-02-10T21:00:00Z', 'CLOSED'], ['2040-02-11T00:00:00Z', 'CLOSED']
  ])('%s is %s', (now, state) => {
    expect(admissionWindow(event, new Date(now))).toEqual({ opensAt: '2040-02-10T16:00:00.000Z', closesAt: '2040-02-10T21:00:00.000Z', state });
  });
  it.each(['DRAFT', 'CANCELLED'] as const)('never opens a %s event', (status) => {
    expect(() => requireOpenAdmission({ ...event, status }, new Date('2040-02-10T18:00:00Z'))).toThrow();
  });
  it.each([{ startAt: new Date('invalid') }, { endAt: new Date('invalid') }, { endAt: event.startAt }])('fails closed for invalid dates %#', (fields) => {
    expect(() => admissionWindow({ ...event, ...fields })).toThrow('schedule could not be verified');
  });
  it('rejects an invalid server clock', () => { expect(() => admissionWindow(event, new Date('invalid'))).toThrow(); });
});

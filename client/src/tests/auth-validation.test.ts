import { describe, expect, it } from 'vitest';
import { validateAuthForm, type AuthFormValues } from '@/lib/auth-validation';

const valid: AuthFormValues = { name: ' Kai Sen ', email: 'kai@example.test', password: 'test-only password', confirmPassword: 'test-only password', role: 'ATTENDEE' };

describe('backend-compatible form boundaries', () => {
  it.each([
    { password: '😀'.repeat(7), error: 'Use at least 8 characters.' },
    { password: 'a'.repeat(129), error: 'Use at most 128 characters and 256 bytes.' },
    { password: '€'.repeat(86), error: 'Use at most 128 characters and 256 bytes.' }
  ])('rejects password outside the Unicode/byte limits (case %#)', ({ password, error }) => {
    expect(validateAuthForm({ ...valid, password, confirmPassword: password }, true).password).toBe(error);
  });

  it.each(['😀'.repeat(8), '  test password  '])('accepts a valid password without trimming it (case %#)', (password) => {
    expect(validateAuthForm({ ...valid, password, confirmPassword: password }, true)).toEqual({});
  });

  it('rejects a nonempty malformed email address', () => {
    expect(validateAuthForm({ ...valid, email: 'kai@' }, false).email).toBe('Enter a valid email address.');
  });
});

import type { UserRole } from '@/types/auth';

export interface AuthFormValues { name: string; email: string; password: string; confirmPassword: string; role: UserRole }
export type AuthFormErrors = Partial<Record<keyof AuthFormValues, string>>;
export function validateAuthForm(values: AuthFormValues, registering: boolean): AuthFormErrors {
  const errors: AuthFormErrors = {};
  if (registering && (values.name.trim().length < 2 || values.name.trim().length > 100)) errors.name = 'Enter your full name (2–100 characters).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()) || values.email.trim().length > 254) errors.email = 'Enter a valid email address.';
  if (Array.from(values.password).length < 8) errors.password = 'Use at least 8 characters.';
  else if (values.password.length > 128 || new TextEncoder().encode(values.password).length > 256) errors.password = 'Use at most 128 characters and 256 bytes.';
  if (registering && values.confirmPassword !== values.password) errors.confirmPassword = 'Your passwords do not match.';
  return errors;
}

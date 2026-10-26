import { ApiRequestError, isRecord, request } from './api';
import type { AuthUser, LoginInput, RegistrationInput } from '@/types/auth';

function publicUser(value: unknown): AuthUser {
  const user = isRecord(value) && value.success === true && isRecord(value.data) ? value.data.user : undefined;
  const keys = ['id', 'name', 'email', 'role', 'createdAt', 'updatedAt'];
  if (!isRecord(user) || Object.keys(user).some((key) => !keys.includes(key)) ||
    typeof user.id !== 'string' || !/^[a-f\d]{24}$/i.test(user.id) ||
    typeof user.name !== 'string' || !user.name || typeof user.email !== 'string' ||
    (user.role !== 'ATTENDEE' && user.role !== 'ORGANIZER') ||
    typeof user.createdAt !== 'string' || !Number.isFinite(Date.parse(user.createdAt)) ||
    typeof user.updatedAt !== 'string' || !Number.isFinite(Date.parse(user.updatedAt))) {
    throw new ApiRequestError('The service returned an unexpected response. Please try again.', undefined, 'INVALID_RESPONSE');
  }
  return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt };
}

export const authApi = {
  me: (signal: AbortSignal) => request('/auth/me', { signal, parse: publicUser }),
  login: (input: LoginInput, signal: AbortSignal) => request('/auth/login', { method: 'POST', body: { email: input.email, password: input.password }, signal, parse: publicUser }),
  register: (input: RegistrationInput, signal: AbortSignal) => request('/auth/register', {
    method: 'POST', body: { name: input.name, email: input.email, password: input.password, role: input.role }, signal, parse: publicUser
  }),
  logout: (signal: AbortSignal) => request('/auth/logout', { method: 'POST', signal, parse(value) {
    if (!isRecord(value) || value.success !== true || value.message !== 'Logged out successfully.') {
      throw new ApiRequestError('The service returned an unexpected response. Please try again.', undefined, 'INVALID_RESPONSE');
    }
  } })
};

import { createContext } from 'react';
import type { ApiRequestError } from '@/services/api';
import type { AuthStatus, AuthUser, LoginInput, RegistrationInput } from '@/types/auth';

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  error: ApiRequestError | null;
  pendingAction: 'login' | 'register' | 'logout' | null;
  login(input: LoginInput): Promise<AuthUser>;
  register(input: RegistrationInput): Promise<AuthUser>;
  logout(): Promise<void>;
  refreshSession(): Promise<void>;
}
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

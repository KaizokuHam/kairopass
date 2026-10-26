export type UserRole = 'ATTENDEE' | 'ORGANIZER';
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
export interface LoginInput { email: string; password: string }
export interface RegistrationInput extends LoginInput { name: string; role: UserRole }
export type AuthStatus = 'INITIALIZING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'UNAVAILABLE';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue } from './AuthContext';
import { authApi } from '@/services/auth';
import { ApiRequestError } from '@/services/api';
import type { AuthStatus, AuthUser, LoginInput, RegistrationInput } from '@/types/auth';

interface SessionState { status: AuthStatus; user: AuthUser | null; error: ApiRequestError | null }
const initialState: SessionState = { status: 'INITIALIZING', user: null, error: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const [pendingAction, setPendingAction] = useState<AuthContextValue['pendingAction']>(null);
  const alive = useRef(false);
  const generation = useRef(0);
  const refreshRequest = useRef<AbortController | null>(null);
  const mutation = useRef<AbortController | null>(null);

  const loadSession = useCallback(async (controller: AbortController, id: number) => {
    try {
      const user = await authApi.me(controller.signal);
      if (alive.current && generation.current === id) setState({ status: 'AUTHENTICATED', user, error: null });
    } catch (error) {
      if (!alive.current || generation.current !== id || controller.signal.aborted) return;
      const failure = error instanceof ApiRequestError ? error : new ApiRequestError('Could not verify your session. Please try again.');
      if (failure.status === 401) setState({ status: 'UNAUTHENTICATED', user: null, error: null });
      else setState((previous) => ({ status: 'UNAVAILABLE', user: previous.user, error: failure }));
    } finally {
      if (refreshRequest.current === controller) refreshRequest.current = null;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (mutation.current) return;
    const id = ++generation.current;
    refreshRequest.current?.abort();
    const controller = new AbortController();
    refreshRequest.current = controller;
    setState((previous) => ({ ...previous, status: 'INITIALIZING', error: null }));
    await loadSession(controller, id);
  }, [loadSession]);

  const perform = useCallback(async <T,>(action: NonNullable<AuthContextValue['pendingAction']>, operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (mutation.current) throw new ApiRequestError('Another account action is finishing. Please wait.', undefined, 'BUSY');
    const id = ++generation.current;
    refreshRequest.current?.abort();
    refreshRequest.current = null;
    const controller = new AbortController();
    mutation.current = controller;
    setPendingAction(action);
    try {
      const result = await operation(controller.signal);
      if (alive.current && generation.current === id) {
        setState(action === 'logout' ? { status: 'UNAUTHENTICATED', user: null, error: null }
          : { status: 'AUTHENTICATED', user: result as AuthUser, error: null });
      }
      return result;
    } catch (error) {
      const failure = error instanceof ApiRequestError ? error : new ApiRequestError('The account service is unavailable. Please try again.');
      if (alive.current && generation.current === id) {
        setState((previous) => action === 'logout' || previous.status === 'INITIALIZING' ||
          failure.status === undefined || failure.status >= 500 || failure.code === 'INVALID_RESPONSE'
          ? { status: 'UNAVAILABLE', user: previous.user, error: failure } : previous);
      }
      throw failure;
    } finally {
      if (mutation.current === controller) {
        mutation.current = null;
        if (alive.current) setPendingAction(null);
      }
    }
  }, []);

  const login = useCallback((input: LoginInput) => perform('login', (signal) => authApi.login(input, signal)), [perform]);
  const register = useCallback((input: RegistrationInput) => perform('register', (signal) => authApi.register(input, signal)), [perform]);
  const logout = useCallback(() => perform('logout', (signal) => authApi.logout(signal)), [perform]);

  useEffect(() => {
    alive.current = true;
    const id = ++generation.current;
    const controller = new AbortController();
    refreshRequest.current = controller;
    void loadSession(controller, id);
    return () => {
      alive.current = false;
      refreshRequest.current?.abort();
      mutation.current?.abort();
    };
  }, [loadSession]);

  const value = useMemo(() => ({ ...state, pendingAction, login, register, logout, refreshSession }),
    [state, pendingAction, login, register, logout, refreshSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

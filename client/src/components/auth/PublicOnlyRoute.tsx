import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { isRecord } from '@/services/api';
import { safeAuthDestination } from '@/lib/auth-navigation';
import { SessionGate } from './SessionGate';

export function PublicOnlyRoute() {
  const auth = useAuth(); const location = useLocation();
  if (auth.status === 'INITIALIZING') return <SessionGate />;
  if (auth.status === 'AUTHENTICATED' && auth.user) {
    const state: unknown = location.state;
    const requested = isRecord(state) ? state.from : new URLSearchParams(location.search).get('redirect');
    return <Navigate to={safeAuthDestination(auth.user.role, requested)} replace />;
  }
  return <Outlet />;
}

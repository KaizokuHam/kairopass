import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { SessionGate } from './SessionGate';

export function ProtectedRoute() {
  const auth = useAuth(); const location = useLocation();
  if (auth.status === 'UNAUTHENTICATED') return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  if (auth.status !== 'AUTHENTICATED' || !auth.user) return <SessionGate />;
  return <Outlet />;
}

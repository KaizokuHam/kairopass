import { Link, Outlet } from 'react-router';
import { ShieldX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/auth';
import { dashboardPath } from '@/lib/auth-navigation';
import { SessionGate } from './SessionGate';

export function RoleGuard({ role }: { role: UserRole }) {
  const { user, status } = useAuth();
  if (status !== 'AUTHENTICATED' || !user) return <SessionGate />;
  if (user.role !== role) return <section className="session-gate">
    <span className="gate-icon"><ShieldX size={28} /></span><p className="eyebrow">403 / A DIFFERENT SPACE</p>
    <h1>This space belongs to another role.</h1><p>Your {user.role.toLowerCase()} account has its own dashboard. Let’s take you there.</p>
    <Link to={dashboardPath(user.role)} className="button button-primary">Go to my dashboard</Link>
  </section>;
  return <Outlet />;
}

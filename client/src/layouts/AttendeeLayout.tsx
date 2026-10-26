import { Outlet } from 'react-router';
import { AttendeeSidebar } from '@/components/reservations/AttendeeSidebar';
import { useAuth } from '@/hooks/useAuth';
export function AttendeeLayout() {
  const { user } = useAuth();
  return <div className="dashboard-layout"><AttendeeSidebar /><section className="organizer-content" key={user?.id}><Outlet /></section></div>;
}

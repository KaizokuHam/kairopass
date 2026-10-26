import { Outlet } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { OrganizerSidebar } from '@/components/events/OrganizerSidebar';
export function OrganizerLayout() {
  const { user } = useAuth();
  return <div className="dashboard-layout"><OrganizerSidebar /><section className="organizer-content" key={user?.id}><Outlet /></section></div>;
}

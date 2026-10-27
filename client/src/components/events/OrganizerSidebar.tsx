import { NavLink, useParams } from 'react-router';
import { BarChart3, CalendarDays, Layers3, Plus, ScanLine, ShieldCheck } from 'lucide-react';
export function OrganizerSidebar() {
  const { id } = useParams();
  return <aside className="dashboard-sidebar organizer-sidebar"><p className="eyebrow">YOUR ORGANIZER SPACE</p>
    <nav className="organizer-nav" aria-label="Organizer workspace"><NavLink to="/organizer/dashboard" end><Layers3 size={17} />Account overview</NavLink>
      <NavLink to="/organizer/events" end><CalendarDays size={17} />My Events</NavLink><NavLink to="/organizer/events/new"><Plus size={17} />Create Event</NavLink><NavLink to="/organizer/analytics"><BarChart3 size={17} />Analytics</NavLink>{id && /^[a-f\d]{24}$/i.test(id) && <><NavLink to={'/organizer/events/' + id + '/check-in'}><ScanLine size={17} />Manage Check-In</NavLink><NavLink to={'/organizer/events/' + id + '/analytics'}><BarChart3 size={17} />View Event Analytics</NavLink></>}</nav>
    <div className="sidebar-note"><ShieldCheck size={19} /><p>Your next great event<br />starts right here.</p></div>
  </aside>;
}

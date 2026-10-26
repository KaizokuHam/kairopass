import { NavLink, useParams } from 'react-router';
import { CalendarDays, Compass, Layers3, LockKeyhole, Plus, ScanLine, ShieldCheck, Users } from 'lucide-react';
export function OrganizerSidebar() {
  const { id } = useParams();
  return <aside className="dashboard-sidebar organizer-sidebar"><p className="eyebrow">YOUR ORGANIZER SPACE</p>
    <nav className="organizer-nav" aria-label="Organizer workspace"><NavLink to="/organizer/dashboard" end><Layers3 size={17} />Account overview</NavLink>
      <NavLink to="/organizer/events" end><CalendarDays size={17} />My Events</NavLink><NavLink to="/organizer/events/new"><Plus size={17} />Create Event</NavLink>{id && /^[a-f\d]{24}$/i.test(id) && <NavLink to={'/organizer/events/' + id + '/check-in'}><ScanLine size={17} />Manage Check-In</NavLink>}</nav>
    <p className="sidebar-label">ON THE HORIZON</p><ul className="upcoming-nav">{[
      { title: 'Attendee insights', task: '12', icon: Users }, { title: 'Analytics', task: '12', icon: Compass }
    ].map(({ title, task, icon: Icon }) => <li key={title} aria-disabled="true"><Icon size={16} /><span>{title}<small>Coming in Task {task}</small></span><LockKeyhole size={12} /></li>)}</ul>
    <div className="sidebar-note"><ShieldCheck size={19} /><p>Your next great event<br />starts right here.</p></div>
  </aside>;
}

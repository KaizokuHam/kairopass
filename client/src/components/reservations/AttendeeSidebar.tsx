import { NavLink } from 'react-router';
import { Compass, Layers3, LockKeyhole, ShieldCheck, Ticket } from 'lucide-react';
export function AttendeeSidebar() {
  return <aside className="dashboard-sidebar organizer-sidebar"><p className="eyebrow">YOUR ATTENDEE SPACE</p><nav className="organizer-nav" aria-label="Attendee workspace">
    <NavLink to="/attendee/dashboard" end><Layers3 size={17} />Account overview</NavLink><NavLink to="/events"><Compass size={17} />Explore Events</NavLink><NavLink to="/attendee/reservations"><Ticket size={17} />My Reservations</NavLink></nav>
    <p className="sidebar-label">ON THE HORIZON</p><ul className="upcoming-nav"><li aria-disabled="true"><Ticket size={16} /><span>My Tickets<small>Coming in Task 10</small></span><LockKeyhole size={12} /></li></ul>
    <div className="sidebar-note"><ShieldCheck size={19} /><p>A little room for<br />your next experience.</p></div></aside>;
}

import { NavLink } from 'react-router';
import { Compass, Layers3, ShieldCheck, Ticket } from 'lucide-react';
export function AttendeeSidebar() {
  return <aside className="dashboard-sidebar organizer-sidebar"><p className="eyebrow">YOUR ATTENDEE SPACE</p><nav className="organizer-nav" aria-label="Attendee workspace">
    <NavLink to="/attendee/dashboard" end><Layers3 size={17} />Account overview</NavLink><NavLink to="/events"><Compass size={17} />Explore Events</NavLink><NavLink to="/attendee/reservations"><Ticket size={17} />My Reservations</NavLink><NavLink to="/attendee/tickets"><Ticket size={17} />My Tickets</NavLink></nav>
    <div className="sidebar-note"><ShieldCheck size={19} /><p>A little room for<br />your next experience.</p></div></aside>;
}

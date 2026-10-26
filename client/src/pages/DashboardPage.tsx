import { Link } from 'react-router';
import { ArrowUpRight, Check, Compass, Layers3, LockKeyhole, ShieldCheck, Ticket } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { dashboardPath } from '@/lib/auth-navigation';
import type { UserRole } from '@/types/auth';
import { OrganizerSidebar } from '@/components/events/OrganizerSidebar';
import { OrganizerEventOverview } from '@/components/events/OrganizerEventOverview';

const upcoming = [{ title: 'Explore Events', task: '07', icon: Compass }, { title: 'My Reservations', task: '08', icon: Layers3 }, { title: 'My Tickets', task: '10', icon: Ticket }];

export function DashboardPage({ role }: { role: UserRole }) {
  const { user } = useAuth();
  if (!user) return null;
  const organizer = role === 'ORGANIZER';
  const joined = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(user.createdAt));
  return <div className="dashboard-layout">
    {organizer ? <OrganizerSidebar /> : <aside className="dashboard-sidebar"><p className="eyebrow">YOUR {role} SPACE</p><Link className="dashboard-current" to={dashboardPath(role)}><Layers3 size={17} />Account overview<span className="status-dot" /></Link>
      <p className="sidebar-label">ON THE HORIZON</p><ul className="upcoming-nav">{upcoming.map(({ title, task, icon: Icon }) => <li key={title} aria-disabled="true"><Icon size={16} /><span>{title}<small>Coming in Task {task}</small></span><LockKeyhole size={12} /></li>)}</ul>
      <div className="sidebar-note"><ShieldCheck size={19} /><p>Your account is ready.<br />The good things are taking shape.</p></div>
    </aside>}
    <section className="dashboard-content" aria-labelledby="dashboard-heading"><p className="eyebrow"><span className="eyebrow-line" />A LITTLE CLOSER TO WHAT’S NEXT</p>
      <h1 id="dashboard-heading">Welcome, <span>{user.name}.</span></h1><p className="dashboard-intro">{organizer ? 'A home for the experiences you’ll bring to life.' : 'A home for your plans, your people, and your next chapter.'}</p>
      <div className="account-card"><div className="account-card-heading"><span className="account-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span><div><h2>Your account</h2><p>Signed in and ready for what’s ahead.</p></div><span className="account-active"><Check size={12} />Active session</span></div>
        <dl className="account-details"><div><dt>Full name</dt><dd>{user.name}</dd></div><div><dt>Email address</dt><dd>{user.email}</dd></div><div><dt>Account type</dt><dd>{organizer ? 'Organizer' : 'Attendee'}</dd></div><div><dt>Member since</dt><dd>{joined}</dd></div></dl>
      </div>
      {organizer ? <OrganizerEventOverview key={user.id} /> : <div className="dashboard-next"><span className="next-icon"><Ticket size={26} strokeWidth={1.4} /></span><p className="eyebrow">UP NEXT</p><h2>Make room for your next experience.</h2><p>Event discovery, reservations, and digital tickets are on the way. This space will bring your journey together.</p><span className="planned-label">COMING IN FUTURE RELEASES <LockKeyhole size={11} /></span></div>}
      <div className="dashboard-footer-note"><span>Built around being there.</span><Link to="/vision" className="text-link">Explore the vision <ArrowUpRight size={14} /></Link></div>
    </section>
  </div>;
}

import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router';
import { ArrowUpRight, LoaderCircle, Menu, RefreshCw, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { dashboardPath } from '@/lib/auth-navigation';
import { LogoutButton } from '@/components/auth/LogoutButton';

export function Navigation() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  return <>
    <button ref={trigger} className="mobile-menu-toggle" type="button" aria-expanded={open} aria-controls="site-navigation" aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen((value) => !value)}>{open ? <X size={21} /> : <Menu size={21} />}</button>
    <nav id="site-navigation" aria-label="Main navigation" className={`site-navigation ${open ? 'is-open' : ''}`}>
      <div className="main-nav"><NavLink to="/" end>Overview</NavLink><NavLink to="/events">Explore Events</NavLink><NavLink to="/vision">The vision</NavLink>
        {auth.status === 'AUTHENTICATED' && auth.user && <><NavLink to={dashboardPath(auth.user.role)}>Dashboard</NavLink>{auth.user.role === 'ORGANIZER' && <NavLink to="/organizer/events">My Events</NavLink>}</>}</div>
      <div className="nav-actions">
        {auth.status === 'INITIALIZING' && <span className="nav-session" role="status"><LoaderCircle size={14} className="spin" />Checking session</span>}
        {auth.status === 'AUTHENTICATED' && auth.user && <><span className="nav-user" title={auth.user.name}>{auth.user.name}<small>{auth.user.role.toLowerCase()}</small></span><LogoutButton /></>}
        {auth.status === 'UNAUTHENTICATED' && <><Link to="/login" className="text-link">Sign in</Link><Link to="/register" className="button button-primary nav-register">Get started <ArrowUpRight size={14} /></Link></>}
        {auth.status === 'UNAVAILABLE' && <><button type="button" className="nav-retry" onClick={() => void auth.refreshSession()} disabled={auth.pendingAction !== null}><RefreshCw size={13} />Session unavailable · Retry</button><Link to="/login" className="text-link">Sign in</Link></>}
      </div>
    </nav>
  </>;
}

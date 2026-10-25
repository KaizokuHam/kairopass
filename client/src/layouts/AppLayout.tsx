import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { ArrowUpRight, Code2 } from 'lucide-react';
import { Brand } from '@/components/Brand';
import { ApiStatus } from '@/components/ApiStatus';

export function AppLayout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header page-width">
        <Link to="/" aria-label="KairoPass home"><Brand /></Link>
        <nav aria-label="Main navigation" className="main-nav">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/vision">The vision</NavLink>
        </nav>
        <a className="source-link" href="https://github.com/KaizokuHam/kairopass" target="_blank" rel="noreferrer">
          <Code2 size={16} /><span>View source</span><ArrowUpRight size={14} />
        </a>
      </header>
      <main id="main" className="page-width" tabIndex={-1}><Outlet /></main>
      <footer className="site-footer page-width">
        <div className="footer-note"><span className="tiny-wordmark">KAIROPASS</span><span>A little closer to being there.</span></div>
        <ApiStatus />
        <span className="version-tag">FOUNDATION <span>/</span> v0.1</span>
      </footer>
    </div>
  );
}

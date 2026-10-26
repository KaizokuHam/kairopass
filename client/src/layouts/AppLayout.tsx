import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { ArrowUpRight, Code2 } from 'lucide-react';
import { Brand } from '@/components/Brand';
import { ApiStatus } from '@/components/ApiStatus';
import { Navigation } from '@/components/Navigation';

export function AppLayout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header page-width">
        <Link to="/" aria-label="KairoPass home"><Brand /></Link>
        <Navigation key={pathname} />
      </header>
      <main id="main" className="page-width" tabIndex={-1}><Outlet /></main>
      <footer className="site-footer page-width">
        <div className="footer-note"><span className="tiny-wordmark">KAIROPASS</span><span>A little closer to being there.</span></div>
        <ApiStatus />
        <a className="source-link footer-source" href="https://github.com/KaizokuHam/kairopass" target="_blank" rel="noreferrer"><Code2 size={14} />View source<ArrowUpRight size={12} /></a>
      </footer>
    </div>
  );
}

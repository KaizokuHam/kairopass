import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  return (
    <section className="content-page not-found">
      <p className="eyebrow">404 / A SMALL DETOUR</p>
      <h1>This chapter<br /><span>isn’t here.</span></h1>
      <p className="page-intro">The page you’re looking for couldn’t be found.</p>
      <Link to="/" className="button button-primary"><ArrowLeft size={16} />Back to KairoPass</Link>
    </section>
  );
}

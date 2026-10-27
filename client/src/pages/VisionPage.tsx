import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';

export function VisionPage() {
  return (
    <section className="content-page" aria-labelledby="vision-heading">
      <Link to="/" className="text-link"><ArrowLeft size={16} />Back to overview</Link>
      <p className="eyebrow">A MORE CONNECTED EXPERIENCE</p>
      <h1 id="vision-heading">Built around<br /><span>being there.</span></h1>
      <p className="page-intro">One thoughtful platform for the people who bring an event to life, and the people who make it worth hosting.</p>
      <div className="vision-grid">
        <article><span className="eyebrow">FOR ATTENDEES</span><h2>Your plans, together.</h2><p>Explore upcoming events, reserve your place, complete simulated checkout, and keep your secure QR tickets together.</p></article>
        <article><span className="eyebrow">FOR ORGANIZERS</span><h2>More room to create.</h2><p>Create, refine, publish, and manage your events. Check in tickets and review booking activity, attendance, and simulated revenue.</p></article>
      </div>
      <aside className="vision-status"><span className="planned-label">CURRENTLY: EXPERIENCES, CONNECTED</span><p>Discovery, event management, reservations, QR tickets, single-use admission, and organizer analytics are available. Every payment is simulated; no real card payment is collected.</p><a className="text-link" href="https://github.com/KaizokuHam/kairopass/blob/main/docs/implementation-plan.md" target="_blank" rel="noreferrer">Follow the roadmap <ArrowUpRight size={16} /></a></aside>
    </section>
  );
}

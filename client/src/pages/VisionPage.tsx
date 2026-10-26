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
        <article><span className="eyebrow">FOR ATTENDEES</span><h2>Your plans, together.</h2><p>We plan to connect event discovery, reservations, simulated checkout, and secure QR tickets. Your booking history will keep the details close at hand.</p></article>
        <article><span className="eyebrow">FOR ORGANIZERS</span><h2>More room to create.</h2><p>Publish events, manage capacity, verify tickets at the door, and understand attendance. These tools will arrive as the platform develops.</p></article>
      </div>
      <aside className="vision-status"><span className="planned-label">CURRENTLY: YOUR ACCOUNT, CONNECTED</span><p>Registration, sign-in, and private attendee and organizer account spaces are available. Event discovery, bookings, payments, and tickets are coming in future releases. All future payments will be simulated; no real card payments will be collected.</p><a className="text-link" href="https://github.com/KaizokuHam/kairopass/blob/main/docs/implementation-plan.md" target="_blank" rel="noreferrer">Follow the roadmap <ArrowUpRight size={16} /></a></aside>
    </section>
  );
}

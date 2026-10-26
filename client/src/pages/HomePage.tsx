import { Link } from 'react-router';
import { ArrowDown, ArrowRight, ArrowUpRight, Compass, Layers3, ScanLine } from 'lucide-react';
import { PassArtwork } from '@/components/PassArtwork';

const pillars = [
  { number: '01', icon: Compass, title: 'Find your people.', text: 'Discover experiences that feel like you. From small gatherings to the next big thing.' },
  { number: '02', icon: Layers3, title: 'Make it happen.', text: 'A considered booking journey, with simulated payments and all your plans in one place.' },
  { number: '03', icon: ScanLine, title: 'Be in the moment.', text: 'Secure digital tickets and a smoother entrance. Less friction between you and being there.' }
];

export function HomePage() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" />EXPERIENCES, CONNECTED.</div>
          <h1 id="hero-heading">Your next<br />chapter,<br /><span>in person.</span><span className="heading-spark" aria-hidden="true">✳</span></h1>
          <p className="hero-description">The best moments happen when you show up.<br className="desktop-break" /> We’re building a better way to get you there.</p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/events">Explore Events <ArrowUpRight size={16} /></Link>
            <Link className="text-link" to="/vision">Explore the vision <ArrowUpRight size={16} /></Link>
          </div>
          <div className="build-note"><span className="build-note-dot" /><span>A work in progress. A world of possibility.</span></div>
        </div>
        <PassArtwork />
      </section>
      <section id="platform" className="platform-section" aria-labelledby="platform-heading">
        <div className="section-heading">
          <div><p className="eyebrow">THE IDEA BEHIND THE PASS</p><h2 id="platform-heading">One space. Every step.</h2></div>
          <a className="planned-label" href="#platform">ON THE HORIZON <ArrowDown size={12} /></a>
        </div>
        <div className="pillar-grid">
          {pillars.map(({ number, icon: Icon, title, text }) => (
            <article key={number} className="pillar">
              <div className="pillar-top"><Icon size={21} strokeWidth={1.5} /><span>{number} /</span></div>
              <h3>{title}</h3><p>{text}</p>
            </article>
          ))}
        </div>
        <div className="foundation-note"><span>Your next experience is out there.</span><p>Discover events, reserve your place, and keep your signed tickets in one wallet.</p><Link to="/events" aria-label="Discover upcoming events"><ArrowRight size={18} /></Link></div>
      </section>
    </>
  );
}

import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { EventForm } from '@/components/events/EventForm';

export function CreateEventPage() {
  return <><Link className="text-link event-back" to="/organizer/events"><ArrowLeft size={14} />My Events</Link>
    <header className="events-heading"><p className="eyebrow">BRING SOMETHING GOOD TO LIFE</p><h1>Create an event.</h1><p>Start with a draft. Make it yours before you publish.</p></header><EventForm /></>;
}

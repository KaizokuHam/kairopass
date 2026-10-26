import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { localDateTimeToIso, localTimezone, toLocalDateTime } from '@/lib/event-format';
import type { DiscoveryQuery } from '@/types/discovery';

export function EventFilters({ query, apply, clear }: { query: DiscoveryQuery; apply: (patch: Partial<DiscoveryQuery>) => void; clear: () => void }) {
  const key = [query.price, query.venue, query.from, query.to].join('|');
  const initial = { price: query.price, venue: query.venue, from: query.from ? toLocalDateTime(query.from) : '', to: query.to ? toLocalDateTime(query.to) : '' };
  const [draft, setDraft] = useState({ key, value: initial, error: '' });
  const value = draft.key === key ? draft.value : initial, error = draft.key === key ? draft.error : '';
  function field(name: keyof typeof value, text: string) { setDraft({ key, value: { ...value, [name]: text }, error: '' }); }
  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = value.from ? localDateTimeToIso(value.from) : '', to = value.to ? localDateTimeToIso(value.to) : '';
    if (from === null || to === null || (from && to && Date.parse(from) > Date.parse(to))) {
      setDraft({ key, value, error: 'Choose valid local dates with the end of the range on or after its start.' }); return;
    }
    apply({ ...value, venue: value.venue.trim(), from, to });
  }
  return <form className="discovery-filter-form" onSubmit={submit} noValidate>
    <label htmlFor="discovery-price">Ticket price</label><select id="discovery-price" value={value.price} onChange={(event) => field('price', event.target.value)}><option value="all">All prices</option><option value="free">Free events</option><option value="paid">Paid events</option></select>
    <label htmlFor="discovery-venue">Venue</label><input id="discovery-venue" type="search" maxLength={200} placeholder="City, space, or venue" value={value.venue} onChange={(event) => field('venue', event.target.value)} />
    <fieldset><legend>When</legend><p>Local time · {localTimezone()}</p><label htmlFor="discovery-from">Starts from</label><input id="discovery-from" type="datetime-local" step="0.001" value={value.from} onChange={(event) => field('from', event.target.value)} aria-describedby={error ? 'discovery-date-error' : undefined} aria-invalid={!!error} />
      <label htmlFor="discovery-to">Starts through</label><input id="discovery-to" type="datetime-local" step="0.001" value={value.to} onChange={(event) => field('to', event.target.value)} aria-describedby={error ? 'discovery-date-error' : undefined} aria-invalid={!!error} />
      <p>Both boundaries are inclusive.</p>{error && <p id="discovery-date-error" className="discovery-field-error" role="alert">{error}</p>}
    </fieldset><Button type="submit">Apply filters</Button><Button variant="ghost" onClick={() => { setDraft({ key: '', value: initial, error: '' }); clear(); }}>Clear filters</Button>
  </form>;
}

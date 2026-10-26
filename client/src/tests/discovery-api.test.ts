import { describe, expect, it, vi } from 'vitest';
import { discoveryApi } from '@/services/discovery';
import { discoveryDefaults, discoveryQueryString, parseDiscoverySearch } from '@/lib/discovery-query';
import { eventAvailability } from '@/lib/event-availability';
import { failure, json } from './fixtures';
import { publicDetail, publicEvent, publicList } from './discovery-fixtures';

describe('public event HTTP contract', () => {
  it('uses relative public GETs, safe query encoding, same-origin cookies, and no-store caching', async () => {
    const fetcher = vi.fn().mockResolvedValue(publicList()); vi.stubGlobal('fetch', fetcher);
    const result = await discoveryApi.list({ ...discoveryDefaults, q: 'Cloud [A.*]', venue: 'Bengaluru & Hall', price: 'paid', from: publicEvent.startAt }, new AbortController().signal);
    const [path, options] = fetcher.mock.calls[0]!;
    const params = new URL(path, 'https://example.test').searchParams;
    expect(params.get('q')).toBe('Cloud [A.*]'); expect(params.get('venue')).toBe('Bengaluru & Hall');
    expect(params.get('from')).toBe(publicEvent.startAt); expect(params.get('price')).toBe('paid');
    expect(path).toMatch(/^\/api\/events\?/); expect(options).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    expect(result.events).toEqual([publicEvent]);
  });
  it('retrieves public details without organizer-specific fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(publicDetail()); vi.stubGlobal('fetch', fetcher);
    expect(await discoveryApi.get(publicEvent.id, new AbortController().signal)).toEqual(publicEvent);
    expect(fetcher.mock.calls[0]![0]).toBe('/api/events/' + publicEvent.id);
  });
  it.each([{ organizerId: 'private' }, { status: 'DRAFT' }, { status: 'CANCELLED' }, { _id: publicEvent.id },
    { pricePaise: 1.5 }, { capacity: 0 }, { reservedCount: 101 }, { startAt: '2040-02-30T10:00:00.000Z' },
    { endAt: publicEvent.startAt }, { registrationDeadline: publicEvent.endAt }, { description: 'x'.repeat(10001) }])('rejects malformed or private DTO fields %j', async (patch) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ success: true, data: { event: { ...publicEvent, ...patch } } })));
    await expect(discoveryApi.get(publicEvent.id, new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it.each([{ limit: 51 }, { totalPages: 5 }, { total: 2 }, { page: 0 }])('rejects inconsistent pagination %j', async (metadata) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(publicList([publicEvent], metadata)));
    await expect(discoveryApi.list(discoveryDefaults, new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('rejects duplicate event identities in a page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(publicList([publicEvent, publicEvent])));
    await expect(discoveryApi.list(discoveryDefaults, new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('rejects malformed IDs locally without issuing an HTTP request', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(discoveryApi.get('../organizer/events', new AbortController().signal)).rejects.toMatchObject({ status: 404 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves safe query errors while hiding raw backend messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failure(400, 'INVALID_DISCOVERY_QUERY')));
    await expect(discoveryApi.list(discoveryDefaults, new AbortController().signal)).rejects.toMatchObject({ status: 400, code: 'INVALID_DISCOVERY_QUERY', message: 'Please review the event search and date filters.' });
  });
});

describe('shareable discovery query state', () => {
  it('round-trips every supported parameter including explicit offsets as UTC', () => {
    const { query, recovered } = parseDiscoverySearch(new URLSearchParams('q=Cloud&venue=Hall&price=free&sort=price_desc&page=2&limit=25&from=2040-02-10T15%3A30%3A00%2B05%3A30&to=2040-02-11T00%3A00%3A00Z'));
    expect(recovered).toBe(false); expect(query.from).toBe(publicEvent.startAt);
    expect(parseDiscoverySearch(new URLSearchParams(discoveryQueryString(query))).query).toEqual(query);
  });
  it.each(['page=-1&limit=999&sort=random&price=cheap', 'from=2040-02-30T10:00:00Z', 'from=2040-02-10T10:00:00',
    'from=2040-02-11T00:00:00Z&to=2040-02-10T00:00:00Z', 'q=a&q=b&organizerId=private'])('recovers safely from malformed URL parameters %s', (value) => {
    const { query, recovered } = parseDiscoverySearch(new URLSearchParams(value));
    expect(recovered).toBe(true); expect(query.page).toBe(1); expect(query.limit).toBe(12);
    expect(discoveryQueryString(query)).not.toContain('organizerId');
  });
});

describe('deterministic availability precedence', () => {
  const now = Date.parse('2040-01-01T00:00:00Z');
  it('shows open only for a published, upcoming event before its deadline with inventory', () => {
    expect(eventAvailability(publicEvent, now).kind).toBe('open');
  });
  it('closes at the exact registration deadline', () => {
    expect(eventAvailability(publicEvent, Date.parse(publicEvent.registrationDeadline)).kind).toBe('closed');
  });
  it('shows sold out for zero remaining inventory', () => {
    expect(eventAvailability({ ...publicEvent, reservedCount: 100 }, now).kind).toBe('sold-out');
  });
  it('gives an elapsed deadline precedence over sold out', () => {
    expect(eventAvailability({ ...publicEvent, reservedCount: 100 }, Date.parse(publicEvent.registrationDeadline)).kind).toBe('closed');
  });
  it.each(['DRAFT', 'CANCELLED'])('never labels %s as open', (status) => {
    expect(eventAvailability({ ...publicEvent, status }, now).kind).toBe('unavailable');
  });
  it('shows unavailable at the exact event start', () => {
    expect(eventAvailability(publicEvent, Date.parse(publicEvent.startAt)).kind).toBe('unavailable');
  });
});

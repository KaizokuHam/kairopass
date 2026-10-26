import type { DiscoveryQuery } from '@/types/discovery';

export const discoveryDefaults: DiscoveryQuery = { q: '', venue: '', price: 'all', sort: 'soonest', page: 1, limit: 12, from: '', to: '' };
const allowed = Object.keys(discoveryDefaults);
function isoBoundary(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return '';
  const time = Date.parse(value);
  // Date.parse rolls over impossible days; compare the written local calendar too.
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  const calendar = new Date(Date.UTC(year, month, 0));
  return Number.isFinite(time) && year >= 100 && month >= 1 && month <= 12 && day >= 1 && day <= calendar.getUTCDate() ? new Date(time).toISOString() : '';
}
export function parseDiscoverySearch(params: URLSearchParams): { query: DiscoveryQuery; recovered: boolean } {
  const query = { ...discoveryDefaults }; let recovered = false;
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length > 1) recovered = true;
  for (const [key, maximum] of [['q', 120], ['venue', 200]] as const) {
    const value = params.get(key) ?? ''; query[key] = value.trim().slice(0, maximum);
    if (value.trim().length > maximum) recovered = true;
  }
  for (const [key, maximum] of [['page', 10000], ['limit', 50]] as const) {
    const value = params.get(key);
    if (value === null) continue;
    if (/^[1-9]\d{0,4}$/.test(value) && Number(value) <= maximum) query[key] = Number(value); else recovered = true;
  }
  const price = params.get('price'), sort = params.get('sort');
  if (price !== null) { if (['all', 'free', 'paid'].includes(price)) query.price = price as DiscoveryQuery['price']; else recovered = true; }
  if (sort !== null) { if (['soonest', 'latest', 'price_asc', 'price_desc'].includes(sort)) query.sort = sort as DiscoveryQuery['sort']; else recovered = true; }
  for (const key of ['from', 'to'] as const) {
    const value = params.get(key);
    if (value !== null) { query[key] = isoBoundary(value); if (!query[key]) recovered = true; }
  }
  if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) { query.from = ''; query.to = ''; recovered = true; }
  return { query, recovered };
}
export function discoveryQueryString(query: DiscoveryQuery): string {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit), sort: query.sort, price: query.price });
  if (query.q) params.set('q', query.q); if (query.venue) params.set('venue', query.venue);
  if (query.from) params.set('from', query.from); if (query.to) params.set('to', query.to);
  return params.toString();
}

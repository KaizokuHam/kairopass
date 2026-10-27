export function rupeesToPaise(value: string): number | null {
  const text = value.trim();
  if (text.length > 24 || !/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole = '0', fraction = ''] = text.split('.');
  const paise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) : null;
}
export function paiseToRupees(value: number | string): string {
  const paise = BigInt(value);
  return (paise / 100n).toString() + '.' + (paise % 100n).toString().padStart(2, '0');
}
export function formatPrice(value: number | string): string {
  const [whole, fraction] = paiseToRupees(value).split('.');
  return '₹' + new Intl.NumberFormat('en-IN').format(BigInt(whole!)) + '.' + fraction;
}
const pad = (value: number, width = 2) => String(value).padStart(width, '0');
export function toLocalDateTime(iso: string): string {
  const date = new Date(iso);
  const base = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  return base + (date.getSeconds() || date.getMilliseconds() ? ':' + pad(date.getSeconds()) + (date.getMilliseconds() ? '.' + pad(date.getMilliseconds(), 3) : '') : '');
}
/** Round-trip calendar components to reject impossible dates and local DST gaps. */
export function localDateTimeToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) return null;
  const parts = [Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0), Number((match[7] ?? '').padEnd(3, '0'))] as const;
  const date = new Date(...parts);
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] || date.getDate() !== parts[2] ||
    date.getHours() !== parts[3] || date.getMinutes() !== parts[4] || date.getSeconds() !== parts[5] || date.getMilliseconds() !== parts[6]) return null;
  return date.toISOString();
}
export const localTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const formatEventDate = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

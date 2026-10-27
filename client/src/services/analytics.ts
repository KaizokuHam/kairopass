import { ApiRequestError, isRecord, request } from './api';
import { currentKeys, periodKeys, seriesKeys, type AnalyticsMetrics, type AnalyticsQuery, type AnalyticsReport } from '@/types/analytics';
const id = /^[a-f\d]{24}$/i;
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const money = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d{0,33})$/.test(value);
function invalid(): never { throw new ApiRequestError('Analytics returned an unexpected response. Please retry.', undefined, 'INVALID_RESPONSE'); }
const expectedRate = (a: number, b: number) => b && a <= b ? Math.round(a / b * 10000) / 100 : null;
function metrics(value: unknown): AnalyticsMetrics {
  if (!isRecord(value) || !isRecord(value.current) || !isRecord(value.period) || !isRecord(value.integrity)) return invalid();
  const c = value.current, p = value.period, i = value.integrity;
  if (!currentKeys.every((k) => count(c[k])) || !periodKeys.every((k) => count(p[k])) || !count(i.invalidSuccessReservations) || !count(i.invalidTicketRecords) || !money(p.simulatedGrossRevenuePaise)) return invalid();
  const result: AnalyticsMetrics = {
    current: { ...Object.fromEntries(currentKeys.map((k) => [k, c[k]])) as AnalyticsMetrics['current'], capacityUtilization: c.capacityUtilization as number | null, attendanceRate: c.attendanceRate as number | null },
    period: { ...Object.fromEntries(periodKeys.map((k) => [k, p[k]])) as AnalyticsMetrics['period'], simulatedGrossRevenuePaise: p.simulatedGrossRevenuePaise, reservationConversionRate: p.reservationConversionRate as number | null },
    integrity: { invalidSuccessReservations: i.invalidSuccessReservations, invalidTicketRecords: i.invalidTicketRecords }
  };
  const current = result.current, period = result.period;
  if (current.occupiedCapacity > current.capacity || current.remainingCapacity !== current.capacity - current.occupiedCapacity ||
    current.capacityUtilization !== expectedRate(current.occupiedCapacity, current.capacity) || current.attendanceRate !== expectedRate(current.ticketsUsed, current.confirmedBookings) ||
    period.reservationConversionRate !== expectedRate(period.cohortConfirmed, period.reservationsCreated)) return invalid();
  return result;
}
export function parseAnalytics(value: unknown, eventId?: string): AnalyticsReport {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) return invalid();
  const { scope, trends, events, pagination: p } = value.data;
  if (!isRecord(scope) || !date(scope.from) || !date(scope.to) || !date(scope.generatedAt) || scope.timezone !== 'UTC' || !count(scope.bucketDays) || scope.bucketDays < 1 ||
    Date.parse(scope.to) <= Date.parse(scope.from) || !Array.isArray(trends) || !trends.length || trends.length > 90 || !Array.isArray(events) ||
    !isRecord(p) || !['page', 'limit', 'total', 'totalPages'].every((k) => count(p[k]))) return invalid();
  const resultMetrics = metrics(value.data.metrics);
  const points = trends.map((point) => {
    if (!isRecord(point) || !date(point.from) || !date(point.to) || !seriesKeys.every((k) => count(point[k])) || !money(point.simulatedGrossRevenuePaise)) return invalid();
    return { from: point.from, to: point.to, ...Object.fromEntries(seriesKeys.map((k) => [k, point[k]])) as Record<typeof seriesKeys[number], number>, simulatedGrossRevenuePaise: point.simulatedGrossRevenuePaise };
  });
  if (points[0]?.from !== scope.from || points.at(-1)?.to !== scope.to || points.some((point, index) => Date.parse(point.to) <= Date.parse(point.from) || (index > 0 && point.from !== points[index - 1]?.to))) return invalid();
  for (const key of seriesKeys) if (points.reduce((n, point) => n + point[key], 0) !== resultMetrics.period[key]) return invalid();
  if (points.reduce((n, point) => n + BigInt(point.simulatedGrossRevenuePaise), 0n) !== BigInt(resultMetrics.period.simulatedGrossRevenuePaise)) return invalid();
  const rows = events.map((event) => {
    if (!isRecord(event) || typeof event.id !== 'string' || !id.test(event.id) || (eventId && event.id !== eventId) || typeof event.title !== 'string' || !event.title.trim() || !['DRAFT', 'PUBLISHED', 'CANCELLED'].includes(String(event.status)) || !date(event.startAt)) return invalid();
    return { id: event.id, title: event.title, status: event.status as AnalyticsReport['events'][number]['status'], startAt: event.startAt, ...metrics(event) };
  });
  const page = p.page as number, limit = p.limit as number, total = p.total as number, totalPages = p.totalPages as number;
  if (page < 1 || page > 10000 || limit < 1 || limit > 50 || totalPages !== Math.ceil(total / limit) || rows.length !== Math.max(0, Math.min(limit, total - (page - 1) * limit)) || new Set(rows.map((e) => e.id)).size !== rows.length || total !== resultMetrics.current.totalEvents) return invalid();
  return { scope: { from: scope.from, to: scope.to, generatedAt: scope.generatedAt, timezone: 'UTC', bucketDays: scope.bucketDays }, metrics: resultMetrics, trends: points, events: rows, pagination: { page, limit, total, totalPages } };
}
export function analyticsQueryString(query: AnalyticsQuery) {
  const params = new URLSearchParams({ page: String(query.page), limit: '10', sort: query.sort });
  if (query.from !== undefined || query.to !== undefined) { if (query.from !== undefined) params.set('from', query.from); if (query.to !== undefined) params.set('to', query.to); } else params.set('period', query.period ?? '30d');
  if (query.eventId) params.set('eventId', query.eventId); return params.toString();
}
export const analyticsApi = { report: (query: AnalyticsQuery, signal: AbortSignal, pathEvent?: string) => {
  if (pathEvent && !id.test(pathEvent)) throw new ApiRequestError('This event could not be found.', 404, 'EVENT_NOT_FOUND');
  return request((pathEvent ? '/organizer/events/' + pathEvent + '/analytics' : '/organizer/analytics/overview') + '?' + analyticsQueryString(query), { signal, parse: (value) => parseAnalytics(value, pathEvent ?? query.eventId) });
} };

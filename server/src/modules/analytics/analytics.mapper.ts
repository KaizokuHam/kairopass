import { ApiError } from '../../lib/api-error.js';
import { currentKeys, periodKeys, integrityKeys, seriesKeys, type RawMetrics, type RawReport, type ReportScope } from './analytics.types.js';
function unavailable(): never { throw new ApiError(503, 'ANALYTICS_STATE_UNAVAILABLE', 'Reporting data could not be verified. Please retry.'); }
export function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return unavailable();
  return value;
}
export function amount(value: unknown): string {
  const text = value === undefined ? '0' : String(value);
  if (!/^(0|[1-9]\d{0,33})$/.test(text)) return unavailable();
  return text;
}
export function rate(numerator: number, denominator: number) {
  return denominator > 0 && numerator <= denominator ? Math.round(numerator / denominator * 10000) / 100 : null;
}
function counts<const K extends readonly string[]>(keys: K, raw: RawMetrics, prefix: string) {
  return Object.fromEntries(keys.map((k) => [k, count(raw[prefix + k] ?? 0)])) as Record<K[number], number>;
}
export function mapMetrics(raw: RawMetrics = {}) {
  const current = counts(currentKeys, raw, 'c_'), period = counts(periodKeys, raw, 'p_'), integrity = counts(integrityKeys, raw, 'i_');
  if (current.occupiedCapacity > current.capacity) return unavailable();
  return {
    current: { ...current, remainingCapacity: current.capacity - current.occupiedCapacity,
      capacityUtilization: rate(current.occupiedCapacity, current.capacity), attendanceRate: rate(current.ticketsUsed, current.confirmedBookings) },
    period: { ...period, simulatedGrossRevenuePaise: amount(raw.money), reservationConversionRate: rate(period.cohortConfirmed, period.reservationsCreated) },
    integrity
  };
}
export function mapReport(raw: RawReport | undefined, scope: ReportScope, page: number, limit: number) {
  // A $facet always returns one envelope, including for zero owned events.
  // Missing output is an unavailable report, never evidence of zero business activity.
  if (!raw) return unavailable();
  const total = count(raw?.totals[0]?.total ?? 0);
  const points = new Map((raw?.series ?? []).map((point) => [point._id, point]));
  const length = Math.ceil((scope.to.getTime() - scope.from.getTime()) / scope.bucketMs);
  if (length < 1 || length > 90) return unavailable();
  return {
    scope: { from: scope.from.toISOString(), to: scope.to.toISOString(), generatedAt: scope.generatedAt.toISOString(), timezone: 'UTC' as const, bucketDays: scope.bucketMs / 86400000 },
    metrics: mapMetrics(raw?.metrics[0]),
    trends: Array.from({ length }, (_, bucket) => {
      const point = points.get(bucket), start = scope.from.getTime() + bucket * scope.bucketMs;
      return { from: new Date(start).toISOString(), to: new Date(Math.min(scope.to.getTime(), start + scope.bucketMs)).toISOString(),
        ...Object.fromEntries(seriesKeys.map((k) => [k, count(point?.[k] ?? 0)])) as Record<typeof seriesKeys[number], number>, simulatedGrossRevenuePaise: amount(point?.money) };
    }),
    events: (raw?.events ?? []).map((event) => {
      if (!event._id || typeof event.title !== 'string' || !['DRAFT', 'PUBLISHED', 'CANCELLED'].includes(event.status) || !(event.startAt instanceof Date) || !Number.isFinite(event.startAt.getTime())) return unavailable();
      return { id: event._id.toString(), title: event.title, status: event.status, startAt: event.startAt.toISOString(), ...mapMetrics(event.metrics) };
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}

import { useCallback } from 'react';
import { useOrganizerResource } from './useOrganizerEvents';
import { analyticsApi, analyticsQueryString } from '@/services/analytics';
import type { AnalyticsQuery } from '@/types/analytics';
export function useAnalytics(query: AnalyticsQuery, eventId?: string) {
  const key = analyticsQueryString(query);
  const load = useCallback((signal: AbortSignal) => {
    const p = new URLSearchParams(key);
    return analyticsApi.report({ page: Number(p.get('page')), sort: p.get('sort') as AnalyticsQuery['sort'],
      ...(p.has('from') || p.has('to') ? { from: p.get('from') ?? '', to: p.get('to') ?? '' } : { period: p.get('period') as NonNullable<AnalyticsQuery['period']> }),
      ...(p.get('eventId') ? { eventId: p.get('eventId')! } : {}) }, signal, eventId);
  }, [key, eventId]);
  return useOrganizerResource('analytics:' + (eventId ?? '') + ':' + key, load);
}

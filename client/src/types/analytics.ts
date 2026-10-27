export const currentKeys = ['totalEvents', 'publishedEvents', 'draftEvents', 'cancelledEvents', 'capacity', 'occupiedCapacity', 'remainingCapacity', 'totalReservations', 'activeHolds', 'elapsedHolds', 'confirmedBookings', 'expiredHolds', 'cancelledHolds', 'ticketsCreated', 'ticketsIssued', 'ticketsUsed', 'ticketsRevoked'] as const;
export const periodKeys = ['eventsCreated', 'reservationsCreated', 'cohortConfirmed', 'successfulSimulatedPayments', 'failedSimulatedPaymentAttempts', 'pendingSimulatedAttempts', 'ticketsCreated', 'checkIns'] as const;
export const seriesKeys = ['reservationsCreated', 'cohortConfirmed', 'successfulSimulatedPayments', 'checkIns'] as const;
export interface AnalyticsMetrics {
  current: Record<typeof currentKeys[number], number> & { capacityUtilization: number | null; attendanceRate: number | null };
  period: Record<typeof periodKeys[number], number> & { simulatedGrossRevenuePaise: string; reservationConversionRate: number | null };
  integrity: { invalidSuccessReservations: number; invalidTicketRecords: number };
}
export interface AnalyticsPoint extends Record<typeof seriesKeys[number], number> { from: string; to: string; simulatedGrossRevenuePaise: string }
export interface EventPerformance extends AnalyticsMetrics { id: string; title: string; status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED'; startAt: string }
export interface AnalyticsReport {
  scope: { from: string; to: string; generatedAt: string; timezone: 'UTC'; bucketDays: number };
  metrics: AnalyticsMetrics; trends: AnalyticsPoint[]; events: EventPerformance[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all';
export type AnalyticsSort = 'date_asc' | 'date_desc' | 'bookings' | 'revenue' | 'checkins';
export interface AnalyticsQuery { period?: AnalyticsPeriod; from?: string; to?: string; eventId?: string; page: number; sort: AnalyticsSort }

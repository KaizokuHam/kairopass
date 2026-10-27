export const currentKeys = ['totalEvents', 'publishedEvents', 'draftEvents', 'cancelledEvents', 'capacity', 'occupiedCapacity', 'totalReservations', 'activeHolds', 'elapsedHolds', 'confirmedBookings', 'expiredHolds', 'cancelledHolds', 'ticketsCreated', 'ticketsIssued', 'ticketsUsed', 'ticketsRevoked'] as const;
export const periodKeys = ['eventsCreated', 'reservationsCreated', 'cohortConfirmed', 'successfulSimulatedPayments', 'failedSimulatedPaymentAttempts', 'pendingSimulatedAttempts', 'ticketsCreated', 'checkIns'] as const;
export const integrityKeys = ['invalidSuccessReservations', 'invalidTicketRecords'] as const;
export const seriesKeys = ['reservationsCreated', 'cohortConfirmed', 'successfulSimulatedPayments', 'checkIns'] as const;
export interface ReportScope { from: Date; to: Date; generatedAt: Date; bucketMs: number }
export type RawMetrics = Record<string, unknown>;
export interface RawEvent { _id: { toString(): string }; title: string; status: string; startAt: Date; metrics: RawMetrics }
export interface RawPoint extends RawMetrics { _id: number }
export interface RawReport { metrics: RawMetrics[]; events: RawEvent[]; totals: { total: number }[]; series: RawPoint[] }

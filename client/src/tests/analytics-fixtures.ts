import { currentKeys, periodKeys, type AnalyticsMetrics, type AnalyticsReport } from '@/types/analytics';
import { sampleEvent } from './events-fixtures';
import { json } from './fixtures';
export function emptyMetrics(): AnalyticsMetrics {
  return { current: { ...Object.fromEntries(currentKeys.map((k) => [k, 0])) as AnalyticsMetrics['current'], capacityUtilization: null, attendanceRate: null },
    period: { ...Object.fromEntries(periodKeys.map((k) => [k, 0])) as Record<typeof periodKeys[number], number>, simulatedGrossRevenuePaise: '0', reservationConversionRate: null }, integrity: { invalidSuccessReservations: 0, invalidTicketRecords: 0 } };
}
export function analyticsFixture(): AnalyticsReport {
  const metrics: AnalyticsMetrics = { current: { totalEvents: 4, publishedEvents: 2, draftEvents: 1, cancelledEvents: 1, capacity: 20, occupiedCapacity: 6, remainingCapacity: 14, capacityUtilization: 30,
    totalReservations: 8, activeHolds: 1, elapsedHolds: 1, confirmedBookings: 4, expiredHolds: 1, cancelledHolds: 1, ticketsCreated: 3, ticketsIssued: 1, ticketsUsed: 1, ticketsRevoked: 1, attendanceRate: 25 },
    period: { eventsCreated: 2, reservationsCreated: 7, cohortConfirmed: 3, successfulSimulatedPayments: 4, failedSimulatedPaymentAttempts: 2, pendingSimulatedAttempts: 2, ticketsCreated: 3, checkIns: 1, simulatedGrossRevenuePaise: '149700', reservationConversionRate: 42.86 }, integrity: { invalidSuccessReservations: 0, invalidTicketRecords: 0 } };
  return { scope: { from: '2040-02-08T00:00:00.000Z', to: '2040-02-10T09:00:00.000Z', generatedAt: '2040-02-10T09:00:00.000Z', timezone: 'UTC', bucketDays: 1 }, metrics,
    trends: [
      { from: '2040-02-08T00:00:00.000Z', to: '2040-02-09T00:00:00.000Z', reservationsCreated: 2, cohortConfirmed: 1, successfulSimulatedPayments: 1, checkIns: 0, simulatedGrossRevenuePaise: '49900' },
      { from: '2040-02-09T00:00:00.000Z', to: '2040-02-10T00:00:00.000Z', reservationsCreated: 4, cohortConfirmed: 2, successfulSimulatedPayments: 3, checkIns: 0, simulatedGrossRevenuePaise: '99800' },
      { from: '2040-02-10T00:00:00.000Z', to: '2040-02-10T09:00:00.000Z', reservationsCreated: 1, cohortConfirmed: 0, successfulSimulatedPayments: 0, checkIns: 1, simulatedGrossRevenuePaise: '0' }
    ], events: ['Paid performance', 'Free performance', 'Draft history', 'Cancelled history'].map((title, index) => {
      const row = emptyMetrics(); row.current.totalEvents = 1; row.current.capacity = row.current.remainingCapacity = index === 0 ? 10 : index === 1 ? 4 : 3; row.current.capacityUtilization = 0;
      const status = index < 2 ? 'PUBLISHED' : index === 2 ? 'DRAFT' : 'CANCELLED'; row.current[status === 'PUBLISHED' ? 'publishedEvents' : status === 'DRAFT' ? 'draftEvents' : 'cancelledEvents'] = 1;
      if (index === 0) {
        Object.assign(row.current, { occupiedCapacity: 5, remainingCapacity: 5, capacityUtilization: 50, totalReservations: 7, activeHolds: 1, elapsedHolds: 1, confirmedBookings: 3, expiredHolds: 1, cancelledHolds: 1, ticketsCreated: 2, ticketsIssued: 1, ticketsUsed: 1, attendanceRate: 33.33 });
        Object.assign(row.period, { reservationsCreated: 6, cohortConfirmed: 2, successfulSimulatedPayments: 3, failedSimulatedPaymentAttempts: 2, pendingSimulatedAttempts: 2, ticketsCreated: 2, checkIns: 1, simulatedGrossRevenuePaise: '149700', reservationConversionRate: 33.33 });
      } else if (index === 1) {
        Object.assign(row.current, { occupiedCapacity: 1, remainingCapacity: 3, capacityUtilization: 25, totalReservations: 1, confirmedBookings: 1, ticketsCreated: 1, ticketsRevoked: 1, attendanceRate: 0 });
        Object.assign(row.period, { eventsCreated: 1, reservationsCreated: 1, cohortConfirmed: 1, successfulSimulatedPayments: 1, ticketsCreated: 1, reservationConversionRate: 100 });
      } else if (index === 2) row.period.eventsCreated = 1;
      return { id: index === 0 ? sampleEvent.id : '607f1f77bcf86cd79943901' + (index + 2), title, status, startAt: sampleEvent.startAt, ...row };
    }), pagination: { page: 1, limit: 10, total: 4, totalPages: 1 } };
}
export const analyticsResponse = (report = analyticsFixture()) => json({ success: true, data: report });
export function emptyReport() {
  const report = analyticsFixture(); report.metrics = emptyMetrics(); report.events = []; report.pagination = { page: 1, limit: 10, total: 0, totalPages: 0 };
  report.trends = report.trends.map((point) => ({ ...point, reservationsCreated: 0, cohortConfirmed: 0, successfulSimulatedPayments: 0, checkIns: 0, simulatedGrossRevenuePaise: '0' })); return report;
}

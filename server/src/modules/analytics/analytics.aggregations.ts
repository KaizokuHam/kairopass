import { Types, type PipelineStage } from 'mongoose';
import { currentKeys, periodKeys, integrityKeys, seriesKeys, type ReportScope } from './analytics.types.js';
import type { AnalyticsQuery } from './analytics.validation.js';
const yes = (condition: unknown) => ({ $cond: [condition, 1, 0] });
const eq = (field: string, value: unknown) => ({ $eq: [field, value] });
const zero = { $toDecimal: 0 };
const sumFields = (names: readonly string[]) => Object.fromEntries(names.map((name) => [name, { $sum: '$' + name }]));
export const metricFields = [...currentKeys.map((v) => 'c_' + v), ...periodKeys.map((v) => 'p_' + v), ...integrityKeys.map((v) => 'i_' + v), 'money'];
function within(field: string, scope: ReportScope) { return { $and: [{ $eq: [{ $type: field }, 'date'] }, { $gte: [field, scope.from] }, { $lt: [field, scope.to] }] }; }
function bucket(field: string, scope: ReportScope) { return { $floor: { $divide: [{ $subtract: [field, scope.from] }, scope.bucketMs] } }; }
function moneyValid(field: string) {
  return { $and: [{ $isNumber: field }, { $gte: [field, 0] }, { $lte: [field, Number.MAX_SAFE_INTEGER] }, { $eq: [field, { $convert: { input: field, to: 'long', onError: null, onNull: null } }] }] };
}
const hasReservation = { $eq: [{ $type: '$r._id' }, 'objectId'] };
function ticketMetrics(scope: ReportScope, series: boolean) {
  const used = { $and: [eq('$$ticket.status', 'USED'), { $eq: [{ $type: '$$ticket.checkedInAt' }, 'date'] }] };
  const issued = { $and: [eq('$$ticket.status', 'ISSUED'), { $eq: [{ $type: '$$ticket.checkedInAt' }, 'null'] }] };
  return { $let: { vars: { ticket: { $first: '$tickets' } }, in: { $cond: [
    { $and: [hasReservation, { $eq: [{ $type: '$$ticket._id' }, 'objectId'] }] }, {
      c_ticketsCreated: 1, c_ticketsIssued: yes(issued), c_ticketsUsed: yes(used), c_ticketsRevoked: yes(eq('$$ticket.status', 'REVOKED')),
      p_ticketsCreated: yes(within('$$ticket.createdAt', scope)), p_checkIns: yes({ $and: [used, within('$$ticket.checkedInAt', scope)] }),
      i_invalidTicketRecords: yes({ $not: [{ $or: [issued, used, eq('$$ticket.status', 'REVOKED')] }] }),
      ...(series ? { points: { $cond: [{ $and: [used, within('$$ticket.checkedInAt', scope)] }, [{ bucket: bucket('$$ticket.checkedInAt', scope), checkIns: 1 }], []] } } : {})
    }, {} ] } } };
}
export function reportPipeline(owner: string, query: AnalyticsQuery, scope: ReportScope, series: boolean): PipelineStage[] {
  const validSuccess = { $and: [hasReservation, eq('$payment.status', 'SUCCESS'), eq('$payment.simulationOutcome', 'SUCCESS'),
    { $eq: [{ $type: '$payment.completedAt' }, 'date'] }, moneyValid('$payment.amountPaise'), { $eq: ['$payment.amountPaise', '$r.amountPaise'] }] };
  const validPeriod = { $and: [validSuccess, within('$payment.completedAt', scope)] };
  const fields: Record<string, unknown> = {
    c_totalReservations: yes(hasReservation), c_activeHolds: yes({ $and: [eq('$r.status', 'HELD'), { $gt: ['$r.expiresAt', scope.generatedAt] }] }),
    c_elapsedHolds: yes({ $and: [eq('$r.status', 'HELD'), { $lte: ['$r.expiresAt', scope.generatedAt] }] }),
    c_confirmedBookings: yes(eq('$r.status', 'CONFIRMED')), c_expiredHolds: yes(eq('$r.status', 'EXPIRED')), c_cancelledHolds: yes(eq('$r.status', 'CANCELLED')),
    p_reservationsCreated: yes(within('$r.createdAt', scope)), p_cohortConfirmed: yes({ $and: [within('$r.createdAt', scope), eq('$r.status', 'CONFIRMED')] }),
    p_successfulSimulatedPayments: { $cond: ['$genuine', '$periodSuccesses', 0] }, p_failedSimulatedPaymentAttempts: '$failed', p_pendingSimulatedAttempts: '$pending',
    ...Object.fromEntries(['c_ticketsCreated', 'c_ticketsIssued', 'c_ticketsUsed', 'c_ticketsRevoked', 'p_ticketsCreated', 'p_checkIns', 'i_invalidTicketRecords'].map((k) => [k, { $ifNull: ['$ticket.' + k, 0] }])),
    i_invalidSuccessReservations: yes({ $and: [{ $gt: ['$successes', 0] }, { $not: ['$genuine'] }] }), money: { $cond: ['$genuine', '$money', zero] }
  };
  const eventGroup: PipelineStage.Group = { $group: { _id: '$event._id', event: { $first: '$event' }, ...sumFields(Object.keys(fields)) } };
  const ownFields: Record<string, unknown> = { c_totalEvents: { $literal: 1 }, c_publishedEvents: yes(eq('$event.status', 'PUBLISHED')), c_draftEvents: yes(eq('$event.status', 'DRAFT')), c_cancelledEvents: yes(eq('$event.status', 'CANCELLED')), c_capacity: '$event.capacity', c_occupiedCapacity: '$event.reservedCount', p_eventsCreated: yes(within('$event.createdAt', scope)) };
  const eventMap: PipelineStage.Project = { $project: { _id: 1, title: '$event.title', status: '$event.status', startAt: '$event.startAt',
    metrics: Object.fromEntries(metricFields.map((k) => [k, ownFields[k] ?? '$' + k])) } };
  const sort: Record<string, 1 | -1> = query.sort === 'date_asc' ? { startAt: 1, _id: 1 } : query.sort === 'date_desc' ? { startAt: -1, _id: -1 } :
    { [query.sort === 'bookings' ? 'metrics.c_confirmedBookings' : query.sort === 'revenue' ? 'metrics.money' : 'metrics.c_ticketsUsed']: -1, _id: -1 };
  return [
    { $match: { organizerId: new Types.ObjectId(owner), ...(query.eventId ? { _id: new Types.ObjectId(query.eventId) } : {}) } },
    { $project: { _id: 1, event: { _id: '$_id', title: '$title', status: '$status', startAt: '$startAt', createdAt: '$createdAt', capacity: '$capacity', reservedCount: '$reservedCount' } } },
    // Adjacent equality lookup/unwind stages can be coalesced by MongoDB. Stream
    // related records instead of starting nested subpipelines per reservation.
    { $lookup: { from: 'reservations', localField: '_id', foreignField: 'eventId', as: 'r' } },
    { $unwind: { path: '$r', preserveNullAndEmptyArrays: true } },
    { $project: { event: 1, r: { _id: '$r._id', status: '$r.status', amountPaise: '$r.amountPaise', createdAt: '$r.createdAt', expiresAt: '$r.expiresAt' } } },
    { $lookup: { from: 'paymentattempts', localField: 'r._id', foreignField: 'reservationId', as: 'payment' } },
    { $unwind: { path: '$payment', preserveNullAndEmptyArrays: true } },
    // Reduce payments to one row per booking BEFORE joining its unique ticket.
    // The composite key also preserves each event that has no reservations.
    { $group: { _id: { event: '$event._id', reservation: { $ifNull: ['$r._id', null] } }, event: { $first: '$event' }, r: { $first: '$r' },
      successes: { $sum: yes({ $and: [hasReservation, eq('$payment.status', 'SUCCESS')] }) }, valid: { $sum: yes(validSuccess) },
      periodSuccesses: { $sum: yes(validPeriod) }, completedAt: { $max: { $cond: [validPeriod, '$payment.completedAt', null] } },
      failed: { $sum: yes({ $and: [hasReservation, eq('$payment.status', 'FAILED'), within('$payment.createdAt', scope)] }) },
      pending: { $sum: yes({ $and: [hasReservation, eq('$payment.status', 'PENDING'), within('$payment.createdAt', scope)] }) },
      money: { $sum: { $cond: [validPeriod, { $toDecimal: { $convert: { input: '$payment.amountPaise', to: 'long', onError: null, onNull: null } } }, zero] } }
    } },
    { $set: { genuine: { $and: [eq('$successes', 1), eq('$valid', 1), eq('$r.status', 'CONFIRMED')] } } },
    // Uniqueness bounds the ticket array to one persisted record.
    { $lookup: { from: 'tickets', localField: 'r._id', foreignField: 'reservationId', as: 'tickets' } },
    { $set: { ticket: ticketMetrics(scope, series) } },
    { $project: { _id: 0, event: 1, ...fields, ...(series ? { points: { $concatArrays: [
      { $cond: [within('$r.createdAt', scope), [{ bucket: bucket('$r.createdAt', scope), reservationsCreated: 1, cohortConfirmed: yes(eq('$r.status', 'CONFIRMED')) }], []] },
      { $cond: [{ $and: ['$genuine', { $gt: ['$periodSuccesses', 0] }] }, [{ bucket: bucket('$completedAt', scope), successfulSimulatedPayments: 1, money: '$money' }], []] },
      { $ifNull: ['$ticket.points', []] }
    ] } } : {}) } },
    { $facet: {
      metrics: [eventGroup, eventMap, { $replaceWith: '$metrics' }, { $group: { _id: null, ...sumFields(metricFields) } }],
      events: [eventGroup, eventMap, { $sort: sort }, { $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
      totals: [{ $group: { _id: '$event._id' } }, { $count: 'total' }],
      ...(series ? { series: [{ $unwind: '$points' }, { $group: { _id: '$points.bucket', ...Object.fromEntries([...seriesKeys, 'money'].map((k) => [k, { $sum: '$points.' + k }])) } }, { $sort: { _id: 1 } }] } : {})
    } }
  ];
}

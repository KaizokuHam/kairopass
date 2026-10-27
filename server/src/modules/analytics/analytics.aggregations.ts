import { Types, type PipelineStage } from 'mongoose';
import { currentKeys, periodKeys, integrityKeys, seriesKeys, type ReportScope } from './analytics.types.js';
import type { AnalyticsQuery } from './analytics.validation.js';
type LookupPipeline = NonNullable<PipelineStage.Lookup['$lookup']['pipeline']>;
const yes = (condition: unknown) => ({ $cond: [condition, 1, 0] });
const eq = (field: string, value: unknown) => ({ $eq: [field, value] });
const zero = { $toDecimal: 0 };
const sumFields = (names: readonly string[]) => Object.fromEntries(names.map((name) => [name, { $sum: '$' + name }]));
export const metricFields = [...currentKeys.map((v) => 'c_' + v), ...periodKeys.map((v) => 'p_' + v), ...integrityKeys.map((v) => 'i_' + v), 'money'];
function within(field: string, scope: ReportScope) { return { $and: [{ $eq: [{ $type: field }, 'date'] }, { $gte: [field, scope.from] }, { $lt: [field, scope.to] }] }; }
function bucket(field: string, scope: ReportScope) { return { $cond: [within(field, scope), { $floor: { $divide: [{ $subtract: [field, scope.from] }, scope.bucketMs] } }, -1] }; }
function moneyValid(field: string) {
  return { $and: [{ $isNumber: field }, { $gte: [field, 0] }, { $lte: [field, Number.MAX_SAFE_INTEGER] }, { $eq: [field, { $convert: { input: field, to: 'long', onError: null, onNull: null } }] }] };
}
function paymentStages(scope: ReportScope, series: boolean): LookupPipeline {
  const valid = { $and: [eq('$status', 'SUCCESS'), eq('$simulationOutcome', 'SUCCESS'), { $eq: [{ $type: '$completedAt' }, 'date'] }, moneyValid('$amountPaise'), { $eq: ['$amountPaise', '$$amount'] }] };
  return [
    { $project: { status: 1, simulationOutcome: 1, completedAt: 1, createdAt: 1, amountPaise: 1 } },
    { $set: { valid } },
    { $set: { bucket: { $cond: [eq('$status', 'SUCCESS'), bucket('$completedAt', scope), bucket('$createdAt', scope)] } } },
    { $group: { _id: '$bucket', successes: { $sum: yes(eq('$status', 'SUCCESS')) }, valid: { $sum: yes('$valid') },
      successfulSimulatedPayments: { $sum: yes({ $and: ['$valid', within('$completedAt', scope)] }) },
      failedSimulatedPaymentAttempts: { $sum: yes({ $and: [eq('$status', 'FAILED'), within('$createdAt', scope)] }) },
      pendingSimulatedAttempts: { $sum: yes({ $and: [eq('$status', 'PENDING'), within('$createdAt', scope)] }) },
      money: { $sum: { $cond: [{ $and: ['$valid', within('$completedAt', scope)] }, { $toDecimal: { $convert: { input: '$amountPaise', to: 'long', onError: null, onNull: null } } }, zero] } }
    } },
    { $group: { _id: null, ...sumFields(['successes', 'valid', 'successfulSimulatedPayments', 'failedSimulatedPaymentAttempts', 'pendingSimulatedAttempts', 'money']),
      ...(series ? { points: { $push: { bucket: '$_id', successfulSimulatedPayments: '$successfulSimulatedPayments', money: '$money' } } } : {}) } },
    { $set: { genuine: { $and: [eq('$successes', 1), eq('$valid', 1), '$$confirmed'] } } },
    { $project: { _id: 0, successfulSimulatedPayments: { $cond: ['$genuine', '$successfulSimulatedPayments', 0] }, money: { $cond: ['$genuine', '$money', zero] },
      failedSimulatedPaymentAttempts: 1, pendingSimulatedAttempts: 1, invalidSuccessReservations: yes({ $and: [{ $gt: ['$successes', 0] }, { $not: ['$genuine'] }] }),
      ...(series ? { points: { $cond: ['$genuine', '$points', []] } } : {}) } }
  ];
}
function ticketStages(scope: ReportScope, series: boolean): LookupPipeline {
  const used = { $and: [eq('$status', 'USED'), { $eq: [{ $type: '$checkedInAt' }, 'date'] }] };
  const issued = { $and: [eq('$status', 'ISSUED'), { $eq: [{ $type: '$checkedInAt' }, 'null'] }] };
  return [{ $project: { _id: 0, c_ticketsCreated: { $literal: 1 }, c_ticketsIssued: yes(issued), c_ticketsUsed: yes(used), c_ticketsRevoked: yes(eq('$status', 'REVOKED')),
    p_ticketsCreated: yes(within('$createdAt', scope)), p_checkIns: yes({ $and: [used, within('$checkedInAt', scope)] }),
    i_invalidTicketRecords: yes({ $not: [{ $or: [issued, used, eq('$status', 'REVOKED')] }] }),
    ...(series ? { points: { $cond: [{ $and: [used, within('$checkedInAt', scope)] }, [{ bucket: bucket('$checkedInAt', scope), checkIns: 1 }], []] } } : {}) } }];
}
function reservationStages(scope: ReportScope, series: boolean): LookupPipeline {
  const fields: Record<string, unknown> = {
    c_totalReservations: { $literal: 1 }, c_activeHolds: yes({ $and: [eq('$status', 'HELD'), { $gt: ['$expiresAt', scope.generatedAt] }] }),
    c_elapsedHolds: yes({ $and: [eq('$status', 'HELD'), { $lte: ['$expiresAt', scope.generatedAt] }] }),
    c_confirmedBookings: yes(eq('$status', 'CONFIRMED')), c_expiredHolds: yes(eq('$status', 'EXPIRED')), c_cancelledHolds: yes(eq('$status', 'CANCELLED')),
    p_reservationsCreated: yes(within('$createdAt', scope)), p_cohortConfirmed: yes({ $and: [within('$createdAt', scope), eq('$status', 'CONFIRMED')] }),
    ...Object.fromEntries(['successfulSimulatedPayments', 'failedSimulatedPaymentAttempts', 'pendingSimulatedAttempts'].map((k) => ['p_' + k, { $ifNull: ['$payment.' + k, 0] }])),
    ...Object.fromEntries(['c_ticketsCreated', 'c_ticketsIssued', 'c_ticketsUsed', 'c_ticketsRevoked', 'p_ticketsCreated', 'p_checkIns', 'i_invalidTicketRecords'].map((k) => [k, { $ifNull: ['$ticket.' + k, 0] }])),
    i_invalidSuccessReservations: { $ifNull: ['$payment.invalidSuccessReservations', 0] }, money: { $ifNull: ['$payment.money', zero] }
  };
  const projected = Object.keys(fields);
  return [
    { $project: { status: 1, expiresAt: 1, createdAt: 1, amountPaise: 1 } },
    { $lookup: { from: 'paymentattempts', localField: '_id', foreignField: 'reservationId', let: { amount: '$amountPaise', confirmed: eq('$status', 'CONFIRMED') }, pipeline: paymentStages(scope, series), as: 'payments' } },
    { $lookup: { from: 'tickets', localField: '_id', foreignField: 'reservationId', pipeline: ticketStages(scope, series), as: 'tickets' } },
    { $set: { payment: { $first: '$payments' }, ticket: { $first: '$tickets' } } },
    { $project: { _id: 0, ...fields, ...(series ? { points: { $concatArrays: [
      { $cond: [within('$createdAt', scope), [{ bucket: bucket('$createdAt', scope), reservationsCreated: 1, cohortConfirmed: yes(eq('$status', 'CONFIRMED')) }], []] },
      { $ifNull: ['$payment.points', []] }, { $ifNull: ['$ticket.points', []] }
    ] } } : {}) } },
    { $facet: { metrics: [{ $group: { _id: null, ...sumFields(projected) } }], ...(series ? { series: [{ $unwind: '$points' }, { $match: { 'points.bucket': { $gte: 0 } } },
      { $group: { _id: '$points.bucket', ...Object.fromEntries([...seriesKeys, 'money'].map((k) => [k, { $sum: '$points.' + k }])) } }] } : {}) } }
  ];
}
export function reportPipeline(owner: string, query: AnalyticsQuery, scope: ReportScope, series: boolean): PipelineStage[] {
  const sort: Record<string, 1 | -1> = query.sort === 'date_asc' ? { startAt: 1, _id: 1 } : query.sort === 'date_desc' ? { startAt: -1, _id: -1 } :
    { [query.sort === 'bookings' ? 'metrics.c_confirmedBookings' : query.sort === 'revenue' ? 'metrics.money' : 'metrics.c_ticketsUsed']: -1, _id: -1 };
  const ownFields: Record<string, unknown> = { c_totalEvents: { $literal: 1 }, c_publishedEvents: yes(eq('$status', 'PUBLISHED')), c_draftEvents: yes(eq('$status', 'DRAFT')), c_cancelledEvents: yes(eq('$status', 'CANCELLED')), c_capacity: '$capacity', c_occupiedCapacity: '$reservedCount', p_eventsCreated: yes(within('$createdAt', scope)) };
  const metrics = Object.fromEntries(metricFields.map((k) => [k, ownFields[k] ?? { $ifNull: ['$summary.' + k, k === 'money' ? zero : 0] }]));
  return [
    { $match: { organizerId: new Types.ObjectId(owner), ...(query.eventId ? { _id: new Types.ObjectId(query.eventId) } : {}) } },
    { $lookup: { from: 'reservations', localField: '_id', foreignField: 'eventId', pipeline: reservationStages(scope, series), as: 'activity' } },
    { $set: { activity: { $first: '$activity' } } }, { $set: { summary: { $first: '$activity.metrics' } } },
    { $project: { _id: 1, title: 1, status: 1, startAt: 1, metrics, ...(series ? { series: '$activity.series' } : {}) } },
    { $facet: {
      metrics: [{ $replaceWith: '$metrics' }, { $group: { _id: null, ...sumFields(metricFields) } }],
      events: [{ $sort: sort }, { $skip: (query.page - 1) * query.limit }, { $limit: query.limit }, { $project: { series: 0 } }],
      totals: [{ $count: 'total' }],
      ...(series ? { series: [{ $unwind: '$series' }, { $group: { _id: '$series._id', ...Object.fromEntries([...seriesKeys, 'money'].map((k) => [k, { $sum: '$series.' + k }])) } }, { $sort: { _id: 1 } }] } : {})
    } }
  ];
}

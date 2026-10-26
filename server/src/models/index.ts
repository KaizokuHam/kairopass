import { isDeepStrictEqual } from 'node:util';
import { User } from './User.model.js';
import { Event } from './Event.model.js';
import { Reservation } from './Reservation.model.js';
import { PaymentAttempt } from './PaymentAttempt.model.js';
import { Ticket } from './Ticket.model.js';
import { AuthSession } from './AuthSession.model.js';

export { User, Event, Reservation, PaymentAttempt, Ticket, AuthSession };
export type { AuthSessionRecord, AuthSessionDocument } from './AuthSession.model.js';
export type { UserRecord, UserDocument } from './User.model.js';
export type { EventRecord, EventDocument } from './Event.model.js';
export type { ReservationRecord, ReservationDocument } from './Reservation.model.js';
export type { PaymentAttemptRecord, PaymentAttemptDocument } from './PaymentAttempt.model.js';
export type { TicketRecord, TicketDocument } from './Ticket.model.js';

/** Additive only: never synchronize by dropping indexes in a live database. */
export async function initializeModels(): Promise<void> {
  for (const model of [User, Event, Reservation, PaymentAttempt, Ticket, AuthSession]) {
    await model.createCollection();
    await model.createIndexes();
    const actual = await model.collection.listIndexes().toArray();
    for (const [key, options] of model.schema.indexes()) {
      const index = actual.find((candidate) => candidate.name === options.name);
      if (!index || !isDeepStrictEqual(index.key, key) ||
        Boolean(index.unique) !== Boolean(options.unique) ||
        !isDeepStrictEqual(index.partialFilterExpression, options.partialFilterExpression) ||
        index.expireAfterSeconds !== options.expireAfterSeconds) {
        throw new Error('Database indexes do not match the required model definitions.');
      }
    }
    if (model.modelName === 'Reservation' && actual.some((index) => index.expireAfterSeconds !== undefined)) {
      throw new Error('Reservation history cannot have a TTL index.');
    }
  }
}

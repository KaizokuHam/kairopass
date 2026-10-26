# Organizer event management

Task 05 implements a private organizer API. Event forms (06), public discovery
(07), reservation allocation/expiration (08), payments, and ticketing remain
future work. There is no public event browsing or hard-delete endpoint.

## Access and model

All endpoints are under `/api/organizer/events`. They reuse `requireDatabase`,
`requireAuth(config)`, `requireRole('ORGANIZER')`, and the existing trusted-Origin
defense for mutations. Identity comes from the authenticated persisted user,
never a client-supplied organizer ID. Every resource lookup and conditional write
includes both event ID and organizer ID. Missing and unowned events both return
404 `EVENT_NOT_FOUND`. Attendees receive 403; missing/invalid/revoked sessions
receive 401. Invalid signing configuration or unavailable MongoDB fails with 503.
All organizer event responses use `Cache-Control: no-store`.

The existing Event model is retained: organizer reference, title, description,
venue, start/end/deadline, capacity, integer price in paise, status, reserved
count, and timestamps. Existing event indexes are unchanged. The additive
`reservation_event_status` index (`eventId: 1, status: 1`) supports cancellation's
defensive active-booking lookup. Startup creates/verifies it without dropping
existing indexes or introducing reservation TTL deletion.

## Endpoints

| Method/path | Success | Behavior |
| --- | --- | --- |
| `POST /api/organizer/events` | 201 | Create an owned DRAFT with reservedCount 0 |
| `GET /api/organizer/events` | 200 | List only the current organizer's events |
| `GET /api/organizer/events/:id` | 200 | Retrieve an owned event |
| `PATCH /api/organizer/events/:id` | 200 | Validate and edit permitted fields |
| `POST /api/organizer/events/:id/publish` | 200 | Conditionally publish a valid DRAFT |
| `POST /api/organizer/events/:id/cancel` | 200 | Cancel an unoccupied DRAFT/PUBLISHED event transactionally |

Create/PATCH require JSON. Publish/cancel accept no body or an empty JSON object;
any supplied field is rejected. Every unsafe request requires an exact configured
Origin, even when sent with a valid cookie. Browser JavaScript uses relative
`/api` URLs and lets the browser supply Origin/cookies. Read requests need no
Origin header. Authentication is checked before event input/ownership handling.

### Create request

```json
{
  "title": "Cloud Engineering Workshop",
  "description": "A hands-on introduction to cloud infrastructure.",
  "venue": "SST Bengaluru",
  "startAt": "2026-11-10T10:00:00.000Z",
  "endAt": "2026-11-10T13:00:00.000Z",
  "registrationDeadline": "2026-11-09T18:00:00.000Z",
  "capacity": 100,
  "pricePaise": 19900
}
```

Choose future dates when trying this example after its stated date. `19900`
paise represents INR 199.00. Zero is a valid free-event price; decimal rupee
amounts, numeric strings, fractions, negative values, and unsafe integers are
not valid price inputs.

### Event response

All single-event operations use `{ success: true, data: { event } }`. An explicit
mapper returns only these fields; no `_id`, `__v`, populated user, or Mongoose
metadata is exposed:

```json
{
  "success": true,
  "data": {
    "event": {
      "id": "507f1f77bcf86cd799439011",
      "organizerId": "507f191e810c19729de860ea",
      "title": "Cloud Engineering Workshop",
      "description": "A hands-on introduction to cloud infrastructure.",
      "venue": "SST Bengaluru",
      "startAt": "2026-11-10T10:00:00.000Z",
      "endAt": "2026-11-10T13:00:00.000Z",
      "registrationDeadline": "2026-11-09T18:00:00.000Z",
      "capacity": 100,
      "pricePaise": 19900,
      "reservedCount": 0,
      "status": "DRAFT",
      "createdAt": "2026-10-26T00:00:00.000Z",
      "updatedAt": "2026-10-26T00:00:00.000Z"
    }
  }
}
```

Dates are normalized to UTC ISO strings. Inventory metadata is the persisted
capacity/reserved count, not fabricated availability or reservation statistics.

## Validation and editing

| Field | API constraint |
| --- | --- |
| title | Trimmed string, 3–120 UTF-16 code units |
| description | Optional at creation (defaults to empty), trimmed, at most 10,000 code units |
| venue | Required trimmed string, 1–200 code units |
| startAt/endAt/registrationDeadline | Valid ISO date-time with `Z` or explicit `±HH:MM` offset; calendar validation |
| capacity | Positive integer, at most 1,000,000 |
| pricePaise | Nonnegative safe integer, at most Number.MAX_SAFE_INTEGER |
| route id | Exactly 24 hexadecimal ObjectId characters |

End must be strictly after start, and deadline must not exceed start. New events
must start in the future. Draft edits validate the complete merged state and
require a future start; reschedule an elapsed draft before editing it. A draft
may have an elapsed registration deadline while being prepared, but cannot be
published until the deadline is corrected to a future time.

PATCH requires at least one field. DRAFT permits all eight creation fields.
PUBLISHED permits only title, description, and venue, including after its start;
dates, capacity, price, and deadline are frozen, even if the submitted value is
unchanged. CANCELLED cannot be edited or reopened. Example:

```json
{ "title": "Updated workshop title", "venue": "Room B" }
```

All bodies use strict Zod schemas. `_id`, organizerId, reservedCount, status,
timestamps, `__v`, MongoDB operators, and all other unknown fields are rejected.
The service validates merged state and runs document validation before its
allowlisted conditional update. Capacity cannot fall below occupied inventory.
Event management never overwrites or increments/decrements reservedCount.

## Listing

Example: `GET /api/organizer/events?status=DRAFT&page=1&limit=10&sort=newest&search=Cloud`

| Query | Behavior |
| --- | --- |
| page | Default 1; positive decimal integer, maximum 10,000 |
| limit | Default 10; positive decimal integer, maximum 50 |
| status | Optional DRAFT/PUBLISHED/CANCELLED |
| sort | newest (default) or oldest, by createdAt and then ObjectId in the same direction |
| search | Optional trimmed literal title substring, case insensitive, maximum 120 code units; empty ignored |

Malformed, repeated, or unknown parameters are rejected. Regex metacharacters in
search are escaped; clients cannot supply executable regex patterns/operators.
One organizer-filtered aggregation feeds both the page and total count, with
bounded page output and a 2-second server query budget. Large datasets may need
future cursor pagination/search indexing; no full-text infrastructure is added.
A query timeout is a 503 error, never a successful empty page.

```json
{
  "success": true,
  "data": {
    "events": [],
    "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 }
  }
}
```

`total` counts all owned matches before pagination. Empty collections have zero
totalPages. A valid page beyond the last page returns an empty events array and
the actual total/totalPages. Count/page share the aggregation input; later
requests can reflect intervening changes.

## Lifecycle and concurrency

```mermaid
stateDiagram-v2
    [*] --> DRAFT: create
    DRAFT --> PUBLISHED: valid future start and deadline
    DRAFT --> CANCELLED: no active inventory or reservations
    PUBLISHED --> CANCELLED: no active inventory or reservations
```

Publication revalidates all required fields and date relationships. Both start
and deadline must be strictly in the future; the atomic write also checks these
time boundaries. Repeated publication and repeated cancellation return 409
`INVALID_EVENT_STATE`, rather than an idempotent success. Cancelled records are
retained permanently by this API.

Edits and transitions compare the loaded internal version, current status,
organizer, and reserved count in an atomic `findOneAndUpdate`. Each successful
management mutation increments `__v` explicitly; query updates do not inherit
document-save optimistic concurrency automatically. A lost comparison returns
409 `EVENT_UPDATE_CONFLICT`. No new version parameter is required/exposed.
Task 06 should reload on this conflict and let the organizer review fresh data.
This protects overlapping server operations; it does not detect an old browser
form submitted after another request has already completed before its read.

Cancellation reads the owned event and checks HELD/CONFIRMED reservation records
inside a snapshot transaction, then conditionally writes CANCELLED. It requires
reservedCount exactly zero, and also blocks active documents when a counter is
inconsistent. Even a past-deadline HELD record remains active until Task 08
explicitly expires/releases it. EXPIRED/CANCELLED history is retained and does
not block cancellation. No refunds or automatic booking cancellation are implied.

The cancellation transaction uses primary reads and majority commits. MongoDB's
transaction retry re-reads state and rechecks safety after write conflicts. Two
overlapping actions may both succeed when they serialize legally (for example,
publish followed by cancellation); they cannot restore an older state.

Task 08 must allocate inventory and insert a reservation in one transaction,
conditionally updating this same event only while PUBLISHED/open with capacity.
That shared event write serializes allocation against cancellation: the losing
transaction retries its safety checks. Inserting reservations without that event
write, or raw out-of-band database edits, bypasses this application contract and
is unsupported. Cancellation never repairs mismatched inventory automatically.

References: [MongoDB atomic updates](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/),
[transaction write conflicts](https://www.mongodb.com/docs/v8.0/core/transactions-production-consideration/),
[Mongoose versioning](https://mongoosejs.com/docs/guide.html#versionKey), and
[query validation limits](https://mongoosejs.com/docs/validation.html#update-validators).

## Error contract

Errors reuse `{ success: false, error: { code, message, requestId, details? } }`.
Field details contain paths/messages, never submitted values. Database internals,
credential-bearing errors, stack traces, and other users' records are not returned.

| HTTP/code | Meaning |
| --- | --- |
| 400 INVALID_EVENT_INPUT | Invalid body/query/id/merged event, unknown fields, content type |
| 400 INVALID_JSON / 413 PAYLOAD_TOO_LARGE | Existing global JSON parser rules (32 KB request limit) |
| 401 UNAUTHENTICATED | Missing, invalid, expired, revoked session |
| 403 FORBIDDEN / UNTRUSTED_ORIGIN | Wrong persisted role / rejected mutation Origin |
| 404 EVENT_NOT_FOUND | Missing or unowned event |
| 409 INVALID_EVENT_STATE | Forbidden edit or lifecycle transition |
| 409 EVENT_NOT_PUBLISHABLE | Invalid/elapsed draft at publication |
| 409 EVENT_HAS_ACTIVE_RESERVATIONS | Occupied counter or HELD/CONFIRMED records |
| 409 EVENT_UPDATE_CONFLICT | Concurrent version/status/inventory conflict |
| 503 EVENT_QUERY_TIMEOUT | Listing exceeded its server query budget |
| 503 DATABASE_UNAVAILABLE / AUTH_UNAVAILABLE | Required infrastructure unavailable |
| 500 INTERNAL_ERROR | Sanitized unexpected failure; no fake success |

## Verification

`npm run test:events` runs all event integration suites against owned disposable
MongoDB 8.2.6 replica sets with ephemeral JWT keys and controlled dates. Tests use
actual HTTP authentication, persistence, indexes, ownership, lifecycle operations,
and transactional conflicts. Query barriers pause real reads to reproduce races;
fault injection is limited to failure-path checks. They never use/clean an
application or production database. `npm run test:db`, `npm test`, and CI include
the event suites. See the [acceptance record](implementation-plan.md#task-05-acceptance-record).

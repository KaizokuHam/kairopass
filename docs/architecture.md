# KairoPass architecture

## Modular monolith

One Node.js process owns the API and serves the compiled React application in
production. One MongoDB database holds durable state through Mongoose. This keeps local
setup, transactions, deployment, and evaluation understandable without a
microservice infrastructure. The browser never connects directly to MongoDB.

```text
Development: browser -> Vite :5173 -> /api proxy -> Express :4000
Production:  browser -> Express -> /api routes -> module services -> Mongoose -> MongoDB replica set / Atlas
                              -> compiled React assets / browser routes
```

## Code boundaries

- `client/src/pages`: route-level views.
- `client/src/layouts`: shared navigation and page frame.
- `client/src/components/ui`: accessible primitives, compatible with shadcn/ui conventions.
- `client/src/hooks`: reusable request and interaction state.
- `client/src/services`: typed HTTP abstraction; only relative `/api` requests.
- `client/src/context` and `types`: future global state and shared client contracts.
- `server/src/app.ts`: app factory and middleware wiring; imports never start a listener.
- `server/src/server.ts`: process startup and shutdown only.
- `server/src/config`: validated environment and centralized MongoDB lifecycle/readiness.
- `server/src/middleware`: cross-cutting request logging, errors, and API fallbacks.
- `server/src/modules`: domain modules, introduced only in their assigned tasks.
- `server/src/lib`: infrastructure utilities and shared errors.
- `server/src/models`: User, Event, Reservation, PaymentAttempt, Ticket schemas/types/indexes.
- `server/src/types`: explicit public response DTOs, separate from model records and future Zod inputs.

Future modules: identity, events, reservations, payments, tickets/check-in, and
analytics. Each module will own its router, Zod request validation, service rules,
and persistence operations. Routes should translate HTTP; services should enforce
business invariants. Modules will call explicit service contracts instead of
reaching into each other's controllers. No speculative abstractions or business
endpoints are needed in Task 02. The only added HTTP endpoint is database readiness.

## Deployment and API

All browser API requests use `/api`. A Vite development proxy avoids cross-origin
cookie complexity. Optional local CORS allows only the configured client origin;
production uses the same origin and does not enable CORS by default.

API handlers and their JSON 404 fallback must run before static assets and the
SPA fallback. A missing API route must never return `index.html`. Browser GET
routes may receive the React entry point; missing files must remain 404s.
Production requires a prior frontend build. The health endpoint is liveness only,
not database readiness, and must work without a database. `/api/ready` returns 503
until a transactional MongoDB connection and its required indexes are verified,
and a bounded ping succeeds. Startup failure is reported explicitly while
liveness stays available. Future database-backed routers must use `requireDatabase`.

The error contract is `{ success: false, error: { code, message, requestId } }`.
Unexpected errors must not expose stack traces or internal messages to clients.
Every response gets a generated request ID. Request logs include method, path
without query values, status, duration, and request ID; no request bodies,
authorization headers, or cookies are logged.

## Persistence and data integrity

MongoDB + Mongoose is the permanent authorized database layer. Models define
document validation, explicit unique/partial indexes, and cryptographic nonce
defaults. Connection startup verifies replica-set/sharded topology and actual
indexes; importing app/models never connects. Index initialization is additive
and does not drop live indexes. Query buffering is disabled.

Unique indexes protect normalized emails, active user/event reservations,
payment identities/idempotency keys, and ticket reservation/nonce associations.
References do not enforce existence, ownership, or roles. Mongoose document
validation cannot protect every query update or cross-document invariant.

Task 08 will allocate/release inventory with conditional event updates and MongoDB
transactions. `reservedCount` tracks HELD + CONFIRMED allocations. Expiration must
transition elapsed holds explicitly and decrement capacity exactly once; no TTL
deletes reservation history. Task 09 will confirm simulated payment/reservation
states atomically; Tasks 10/11 will issue one ticket and conditionally consume it
once. These workflows are designed, not implemented in Task 02.

See [database architecture](database.md) for complete fields/indexes, model limits,
transaction examples, expiration/idempotency strategies, QR signing, and local/Atlas setup.

## Security planned for later tasks

Authentication will use signed JWTs in secure HTTP-only cookies, server-side
authorization, organizer ownership checks, and an explicit CSRF strategy before
cookie-authenticated mutations are introduced. QR tickets will require signed
payloads and replay-safe, atomic check-in. Simulated payments will use durable
state transitions and idempotency; they will never collect real card data.

Configuration comes from the root `.env` or process environment; process values
take precedence. `MONGODB_URI` is required for database readiness, but not liveness.
Authentication secrets remain reserved for Task 03. Connection failures never log
the supplied URI or raw driver error. Secrets must never enter client bundles.

## Quality gates

Strict TypeScript, linting, Vitest/Supertest, and a production build are the local
and CI gates. HTTP tests cover the middleware contract, liveness/readiness, and
API/static route separation. Real MongoDB integration tests own a disposable
replica set and verify indexes, validation, transaction commit/rollback, and safe
connection behavior. They never consume or clean an application/Atlas database.
The established Vite proxy and production single-origin client remain unchanged.

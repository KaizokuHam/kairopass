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
- `client/src/context`: in-memory authentication state and request coordination.
- `client/src/types`: explicit client contracts for public users and API responses.
- `client/src/components/auth`: form fields, session gate, logout, and reusable route guards.
- `server/src/app.ts`: app factory and middleware wiring; imports never start a listener.
- `server/src/server.ts`: process startup and shutdown only.
- `server/src/config`: validated environment and centralized MongoDB lifecycle/readiness.
- `server/src/middleware`: cross-cutting request logging, errors, and API fallbacks.
- `server/src/modules`: domain modules, introduced only in their assigned tasks.
- `server/src/lib`: infrastructure utilities and shared errors.
- `server/src/models`: five business models plus AuthSession schemas/types/indexes.
- `server/src/types`: explicit public response DTOs, separate from model records and future Zod inputs.

The implemented auth module owns routes, controllers, services, Zod validation,
token/password utilities, and typed authenticated request context. The events
module owns private organizer event management; discovery owns public upcoming
listing/detail reads and their strict query/public-DTO boundary. Reservations owns
attendee allocation/history/cancellation and transactional expiry. Payments owns
two-stage simulated checkout, idempotency, owned history and atomic confirmation.
Tickets owns verified issuance, owned wallet/detail reads and server-only HMAC
signing/verification. Check-in owns event-specific admission, atomic ticket
consumption and history. Analytics owns private read-only organizer metrics,
trends and event performance, reducing relationships before joining totals. Each owns its router, Zod request validation, service rules,
and persistence operations. Routes should translate HTTP; services should enforce
business invariants. Modules will call explicit service contracts instead of
reaching into each other's controllers. Task 03 adds only the four `/api/auth`
endpoints; Task 05 adds `/api/organizer/events`; Task 07 adds `/api/events`;
Task 08 adds `/api/reservations`; Task 09 adds nested `/:id/payments` routes.
Task 10 adds nested `/:id/ticket` issuance and `/api/tickets` wallet/detail routes.
Task 11 adds GET/POST `/api/organizer/events/:eventId/check-ins`; it mounts before
the generic organizer event router and reuses current session/role/Origin guards.
[Check-in contracts](checkin.md) explain the time policy, single-document write,
privacy, uncertainty recovery and camera cleanup.
Task 12 adds `/api/organizer/analytics/{overview,trends,events}` and owned
`/api/organizer/events/:eventId/analytics`. A combined overview snapshot feeds the
dashboard's KPIs, charts and paginated event table with one request. Current
inventory/lifetime attendance and selected-period activity/cohort conversion are
explicitly separate. See [metric definitions and exact monetary aggregation](analytics.md).
[Ticket contracts](ticketing.md) describe the independent key and recovery boundary.
[Payments](payments.md) uses the existing
connection, session/Origin/role guards and reservation inventory primitives.
See [reservation transaction and worker contracts](reservations.md).

## Deployment and API

All browser API requests use `/api`. A Vite development proxy avoids cross-origin
cookie complexity. Credentialed local CORS allows only the configured client origin;
production uses the same origin and does not enable CORS by default.

API handlers and their JSON 404 fallback must run before static assets and the
SPA fallback. A missing API route must never return `index.html`. Browser GET
routes may receive the React entry point; missing files must remain 404s.
Production requires a prior frontend build. The health endpoint is liveness only,
not database readiness, and must work without a database. `/api/ready` returns 503
until a transactional MongoDB connection and its required indexes are verified,
and a bounded ping succeeds. Startup failure is reported explicitly while
liveness stays available. Auth, events, discovery, reservations, and future database-backed routers use `requireDatabase`.
Readiness retains its database-only meaning; auth configuration is checked separately.

The error contract is `{ success: false, error: { code, message, requestId } }`.
Unexpected errors must not expose stack traces or internal messages to clients.
The central error logger also omits raw exception messages, retaining only fixed
metadata and request correlation. Malformed URL encoding is rejected before route
decoding with 400 INVALID_URL; unsupported JSON charset/encoding returns 415
UNSUPPORTED_MEDIA_TYPE. All error responses are no-store.
Every response gets a generated request ID. Request logs include method, path
without query values, status, duration, and request ID; no request bodies,
authorization headers, or cookies are logged.

## Frontend authentication (Task 04)

`BrowserRouter` wraps one `AuthProvider` and the existing `AppLayout`. The provider
restores `/api/auth/me` on mount and exposes the public user, four-state session
status, pending action, login/register/logout, and retry. `INITIALIZING` and
`UNAVAILABLE` never render protected content; only `/me` 401 confirms
`UNAUTHENTICATED`. Other failures retain the last known identity without granting
access until a successful retry. There is no browser-storage persistence.

An abort controller and generation number discard superseded session reads.
Account mutations invalidate old reads and share a synchronous mutex. Provider
cleanup aborts requests, including StrictMode's first development setup. A form
unmount discards its local password state; a submitted mutation remains owned by
the provider until it settles, since the server may already have set a cookie.

The existing HTTP client supports GET/POST/PATCH, same-origin credentials, JSON bodies,
runtime response validation, timeouts, cancellation, and safe typed errors. Auth
responses allow only public user fields. Status/code/request ID and Retry-After
metadata are available to UI; raw backend exception messages are never displayed.

Public-only login/register routes redirect verified users to their own dashboard.
`ProtectedRoute` gates unresolved sessions and sends confirmed guests to login;
`RoleGuard` renders an access-denied view for the other role. Return destinations
are allowlisted to the verified role's dashboard and implemented organizer/attendee
routes, plus public event details, with safe query/hash preservation. Frontend guards are navigation UX; server role/ownership checks
remain mandatory for every future protected API resource.

Routing uses `useTransitions={false}` so confirmed logout can navigate to `/`
before clearing provider state triggers the former protected route's redirect.
The navigation callback runs only after backend revocation succeeds. A failed
logout leaves identity unverified and provides retry rather than claiming success.

`AuthLayout`, shared form/field components, and one role-configured dashboard
extend the established product shell. Dashboards display real name/email/role/
creation date and honest, noninteractive upcoming modules. Mobile navigation has
a labeled toggle, expanded state, Escape dismissal, and focus restoration.

Local browser development uses **http://localhost:5173**, matching the exact
`CLIENT_ORIGIN` default; the Vite script binds localhost and proxies `/api` to
127.0.0.1:4000. Browser JavaScript sets neither Origin nor cookie headers.
Production still serves client/API on one origin with Secure HTTP-only cookies.

## Organizer event management (Task 05)

`modules/events` separates routing, thin controllers, Zod validation, service
rules, explicit DTO types, and mapping. Its six endpoints live under the private
`/api/organizer/events` namespace; Task 07's separate discovery router owns `/api/events`.
All routes reuse readiness, authentication, persisted ORGANIZER authorization,
and mutation Origin checks. Event lookups/writes include ID and organizer ID;
missing and unowned events share a 404 response. Existing Event fields/indexes
are preserved; Task 07 adds verified schedule/price indexes for public reads.

Strict bodies reject identity, status, inventory, timestamps, operators, and
unknown fields. Draft edits validate complete merged state and document hooks.
Published events freeze dates, prices, and capacity, while cancelled events
cannot be edited or reopened. Conditional writes compare internal version,
status, owner, and reserved count, increment the version, and update only allowed
fields. Management never writes the reservation-owned inventory counter.

Publication requires valid future start/deadline and checks those boundaries
again in the write predicate. Cancellation requires zero occupied inventory and
no HELD/CONFIRMED records inside a snapshot transaction. Its write to the same
event serializes against Task 08's required conditional event allocation and
reservation insertion transaction. Retries reload state and rerun safety checks.
No refunds, inventory repair, deletion, or booking orchestration are implemented.

Listing uses a validated page/limit/status/sort/search contract, literal escaped
title search, deterministic timestamp/ID ordering, and one aggregation for page
and count with a 2-second query budget. The additive reservation event/status
index supports cancellation's defensive lookup. Error handling preserves the
standard request-ID envelope and sanitizes all database failures. See
[event API and concurrency details](events.md) for Task 06 integration and limits.

## Organizer event frontend (Task 06)

OrganizerLayout/Sidebar extend the existing account shell with protected list,
create, detail, and edit routes. A shared form validates complete state, converts
rupee text to exact safe paise, interprets local wall times as UTC ISO values,
and sends only changed permitted fields. Published economics/schedule stay
read-only; cancelled events have no editing or lifecycle controls.

The typed event service extends the existing client and validates essential DTO
and pagination structure. Local read hooks scope requests to verified organizer
identity and query/resource, cancel old reads, and ignore obsolete responses.
There is no persistent/shared event cache. Logout/unresolved authentication
hides protected data; 401/role failures reuse AuthProvider session verification.
List filter state is URL-based, search is debounced, pagination uses real totals,
and all failure states remain distinct from empty results.

Lifecycle actions use reusable accessible confirmation dialogs and serialized
component mutations. UI status is never changed optimistically. Successful
create/edit/action requests lead to fresh detail GETs; navigation remounts list
reads. Conflicts block resubmission until an explicit reload; uncertain network
outcomes prompt review before retry. Background content is inert during modals,
keyboard focus is trapped/restored, and pending controls cannot repeat actions.

The organizer dashboard fetches only three recent events and the API total.
Other metrics are omitted. Public discovery is provided by Task 07; attendee booking by Task 08.
No backend/auth/database changes are needed for Task 06. See
[event frontend contracts and limitations](events.md#organizer-frontend-task-06).

## Public discovery (Task 07)

The public discovery service independently enforces PUBLISHED with a strictly future
start for both list and detail. Private, cancelled, missing, malformed-ID, and past
details share 404. Upcoming closed/sold-out events stay visible. It uses strict Zod
query schemas, escaped title/venue substrings, price/ISO date filters, stable
date/price/ObjectId sorting, and one bounded page/count aggregation with a 2-second
query budget. Dedicated projection and mapping return twelve public fields, without
organizer/account joins. Additive schedule and price indexes retain existing indexes.

Public React routes sit outside session/role gates, reuse typed HTTP requests and
shared price/date utilities, and keep applied query state in the URL. Search is
debounced; resource/attempt keys, abort controllers, and generations prevent stale
results. List/detail availability uses actual inventory and updates known clock
boundaries. Task 08's real Reserve action revalidates in its transaction. Navigation
and attendee discovery actions use real routes. Public browsing remains independent
of JWT configuration; private management retains all existing guards. See
[discovery architecture, contracts, and limits](discovery.md).

## Persistence and data integrity

Task 08's expiration worker is constructed without timers on import. Server startup
starts it after database/index readiness; one bounded batch runs initially and once
per minute. Shutdown stops scheduling immediately while HTTP drains, awaits the
current cleanup operation, then disconnects the shared database connection.
Conditional state transitions protect multiple worker instances; see
[reservation operations and limits](reservations.md#expiration-cancellation-and-process-lifecycle).

MongoDB + Mongoose is the permanent authorized database layer. Models define
document validation, explicit unique/partial indexes, and cryptographic nonce
defaults. Connection startup verifies replica-set/sharded topology and actual
indexes; importing app/models never connects. Index initialization is additive
and does not drop live indexes. Query buffering is disabled.

Unique indexes protect normalized emails, active user/event reservations,
payment identities/idempotency keys, and ticket reservation/nonce associations.
References do not enforce existence, ownership, or roles. Mongoose document
validation cannot protect every query update or cross-document invariant.

Task 08 allocates/releases inventory with conditional event updates and MongoDB
transactions. `reservedCount` tracks HELD + CONFIRMED allocations. Expiration
transitions elapsed holds explicitly and decrements capacity exactly once; no TTL
deletes reservation history. Task 09 confirms simulated payment/reservation
states atomically; Task 10 issues exactly one ticket from durable matching evidence,
with version writes on every eligibility source and no inventory change. Task 11
conditionally consumes the Ticket once using MongoDB's write clock and majority
acknowledgement, preserving inventory and confirmation. Current immutable eligibility
contracts justify one document update; future refunds/transfers must coordinate
with consumption. See [checkin.md](checkin.md), [ticketing.md](ticketing.md) and [reservations.md](reservations.md)
for implemented transaction deadlines, recovery, worker lifecycle and attendee UX.

See [database architecture](database.md) for complete fields/indexes, model limits,
transaction examples, expiration/idempotency strategies, QR signing, and local/Atlas setup.

## Authentication and request security

Authentication uses Argon2id passwords, HS256 JWTs in HTTP-only SameSite=Lax
cookies, and database-backed session revocation. JWTs contain identity/session
claims but no role; `requireAuth` retrieves the current user and `requireRole`
checks persisted roles. Registration creates user and session in one transaction.
Logout revokes the current session before clearing its cookie. Session hashes,
not raw identifiers/tokens, are stored. Session-only TTL cleanup does not affect
business history and is not relied upon to enforce expiration.

Unsafe auth requests require exact configured Origins, including login/register.
Production permits only an explicit HTTPS public origin and forces Secure cookies.
Independent in-memory registration/login limits protect credential work. Proxy
trust is false; forwarding headers cannot define trusted origins or bypass limits.
Distributed/proxied deployments must configure storage/proxy policy deliberately.
Invalid signing configuration leaves health/frontend delivery available while
auth endpoints fail closed with 503. See [authentication](authentication.md).

Role checks alone do not establish resource ownership; future services must
validate organizer ownership separately. QR tickets now use versioned minimal
payloads, domain-separated HMAC-SHA256 and strict constant-time verification with
an independent TICKET_HMAC_SECRET. Only owned active details expose credentials;
wallets omit them. Task 11 verifies current persisted eligibility and atomically
wins ISSUED → USED once; subsequent presentations are denied. Simulated payments use durable
state transitions and idempotency; they never collect real card data.

Configuration comes from the root `.env` or process environment; process values
take precedence. `MONGODB_URI` is required for database readiness, but not liveness.
The client build entry sets NODE_ENV=production before loading Vite, so a copied
development API `.env` cannot select development React in release assets. QR ticket
details/encoding are loaded separately from the entry chunk. The organizer
check-in page is lazy, and the camera decoder loads only after Start camera.
The analytics page is also lazy; its accessible SVG charts need no new dependency.
An omitted HOST uses loopback for development/test and 0.0.0.0 for production;
explicit HOST and platform PORT remain authoritative. Hosted deployment must remove
or change the local example's explicit loopback override.
Authentication requires a strong environment-provided JWT secret and production
origin settings. Connection/auth failures never log secrets or raw credential-
bearing driver errors. Secrets must never enter client bundles.

## Quality gates

Strict TypeScript, linting, Vitest/Supertest, and a production build are the local
and CI gates. HTTP tests cover the middleware contract, liveness/readiness, and
API/static route separation. Real MongoDB integration tests own a disposable
replica set and verify indexes, validation, transaction commit/rollback, and safe
connection behavior. They never consume or clean an application/Atlas database.
Frontend Vitest/React Testing Library/user-event tests use jsdom and mock only
the HTTP boundary. They cover forms, response contracts, races, role guards,
unavailable recovery, and complete form-to-dashboard flows. `npm test` and CI
run both workspaces; `npm run test:web` runs only the frontend suite. Real-browser
integration uses disposable accounts and a separately owned MongoDB replica set.
The established Vite proxy target and production single-origin client are preserved.
Event integration suites reuse the owned replica-set helper and real cookie auth.
Controlled clocks and query barriers test actual optimistic-update conflicts,
transaction retries, and reservation allocation versus cancellation. `test:events`
targets these suites; `test:db`, the full quality gate, and CI also include them.

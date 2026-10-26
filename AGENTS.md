# KairoPass — persistent engineering instructions

## Project

- Name: KairoPass.
- Repository: `KaizokuHam/kairopass` (`origin/main`).
- Architecture: MERN modular monolith; React/Vite client and Express server in npm workspaces.
- Production: Express serves the compiled client and `/api` on one origin.

## Permanent database rule

**MongoDB + Mongoose is the only authorized database layer.**
Do not reintroduce PostgreSQL or Prisma. Use a MongoDB replica set or a compatible
Atlas/sharded cluster for transactions. Follow `docs/database.md` before changing
models, indexes, inventory, payments, tickets, or connection behavior.

## Engineering principles

- Keep the modular backend architecture; use thin controllers and business logic in services.
- Keep Mongoose models isolated from presentation code. Use explicit public DTOs.
- Use Zod at HTTP input boundaries, strict TypeScript, and explicit authorization/ownership checks.
- Use safe error handling. Never expose password hashes, connection strings, credentials, or internal errors.
- Do not connect automatically when importing `app.ts` or models.
- Keep `/api/health` database-independent; use `/api/ready` for database readiness.
- Attach `requireDatabase` to future database-backed routers. Disable query buffering.
- Create/verify indexes before readiness. Do not drop/synchronize live indexes automatically.
- `unique` is an index option, not a Mongoose validator. Verify constraints against real MongoDB.
- ObjectId references do not enforce existence, organizer ownership, or roles; services must check them.
- Mongoose validation and immutable fields do not protect every update/pipeline/raw write.
  Validate state transitions explicitly and use conditional atomic updates/transactions.
- Use integer, nonnegative safe paise amounts. Reservation amounts are immutable price snapshots.
- Event `reservedCount` represents HELD + CONFIRMED inventory only. Allocation and release must be transactional.
- Preserve reservation and failed-payment history. Never add reservation TTL deletion.
- Preserve the active-reservation partial unique index and payment/ticket uniqueness constraints.
- Expire HELD reservations idempotently and release inventory exactly once in Task 08.
- Generate QR nonces only on the backend; use a separate HMAC secret in Task 10.
- No real payment processing, fake success states, or premature later-task workflows.
- Run appropriate integration tests. Database tests must own a disposable replica set,
  ignore application `MONGODB_URI`, and never clean shared/production data.

## Authentication contract (Task 03)

- Read `docs/authentication.md` before changing authentication or adding protected routes.
- Reuse the auth module, Argon2id helpers, JWT utilities, and AuthSession; do not add another database connection.
- JWTs use HS256 and only sub/jti/iat/exp/iss/aud claims; never store a role or credential in a token.
- Store only a SHA-256 hash of the random session identifier. Check revocation and expiry on each request.
- Use `requireDatabase`, `requireAuth(config)`, and `requireRole(...)` as appropriate.
  Authorization uses the current persisted user; role checks do not replace resource ownership checks.
- Use explicit public DTOs. Never return JWTs/password hashes or log credential-bearing values.
- Keep registration user/session writes transactional and handle unique-email races as 409.
- Logout must revoke only the current session before clearing the browser cookie.
- Keep HTTP-only, SameSite=Lax, host-only cookies at `/`; production Secure is mandatory.
- Require exact configured Origins for all future cookie-authenticated unsafe routes;
  include login/register protection. Do not derive trusted origins from request Host/Forwarded headers.
- Preserve per-IP registration/login limits. Proxy trust is false; deployment changes need an explicit trusted-proxy policy.
- Missing/weak JWT secrets disable auth with 503; never add a fallback secret.
- AuthSession-only TTL cleanup is allowed; reservation TTL deletion remains prohibited.
- Use relative API requests and restore state through `/api/auth/me`.
  Do not store tokens in localStorage/sessionStorage or invent authenticated success states.

## Authentication frontend (Task 04)

- Reuse `AuthProvider`/`useAuth`, the existing typed API client, and auth route guards.
- Keep INITIALIZING, AUTHENTICATED, UNAUTHENTICATED, and UNAVAILABLE distinct.
  Only `/me` 401 confirms signed out; network/503 failures must not impersonate logout.
- Preserve abort/generation handling for session reads and the account-mutation mutex.
  Provider cleanup aborts requests; submitted mutations outlive form navigation.
- Never expose cookies to JavaScript or persist identity/credentials in browser storage.
- Wait for backend logout success before clearing user state and navigating to `/`.
  Router transitions are disabled to preserve the tested logout navigation ordering.
- Allowlist post-auth destinations by the actual returned role; reject external/other-role targets.
- Frontend route guards are UX only. Protect future API resources with server auth,
  persisted roles, and explicit ownership checks; current client role is not authority.
- Develop at `http://localhost:5173`, matching exact `CLIENT_ORIGIN`; keep the Vite
  `/api` proxy to `http://127.0.0.1:4000`. Do not weaken Origin security for host aliases.
- Extend the shared auth layout, field/form components, and role-configured dashboard.
  Upcoming modules stay clearly labeled without fake data or misleading dead controls.
- Test with Vitest/RTL/user-event at the HTTP boundary, using real provider/router behavior.
  Preserve accessible labels, error associations, keyboard menus, focus, and responsive layouts.

## Organizer event contract (Task 05)

- Read `docs/events.md` before changing event behavior or building Task 06.
- Reuse `modules/events`, the existing Event model, auth/readiness/Origin guards,
  and explicit organizer DTO. Keep `/api/organizer/events` private; discovery is Task 07.
- Every resource lookup/write must include authenticated organizer ownership;
  return 404 for missing/unowned events. Never accept organizerId from clients.
- Reject unknown/protected fields. Validate merged draft edits and model hooks.
  Published events permit only title/description/venue edits; CANCELLED is terminal.
- Publication needs a future start and deadline. Repeated publish/cancel return 409.
- Preserve conditional version/status/owner/reserved-count predicates and explicit
  version increments on management writes. Never overwrite inventory through edits.
- Cancellation requires zero reservedCount and no HELD/CONFIRMED records in its
  transaction. Elapsed HELD records still block until Task 08 explicitly expires them.
- Task 08 allocation MUST conditionally update the same PUBLISHED event and insert
  its reservation in one transaction, so cancellation races cause conflict/revalidation.
  Raw reservation inserts without that event write bypass this consistency contract.
- Keep reservation_event_status additive; no reservation TTL/history deletion.
- List output remains bounded, deterministically sorted, organizer-scoped, with
  escaped literal search and query timeout errors; never fake an empty success.
- Preserve controlled-clock, real database ownership/lifecycle/concurrency tests.
  On 409 EVENT_UPDATE_CONFLICT, future clients should reload and request review.

## Organizer event frontend (Task 06)

- Extend OrganizerLayout/Sidebar, shared EventForm, typed events service, and the
  scoped read/mutation hooks. Reuse AuthProvider and the existing HTTP client.
- Keep all organizer routes behind ProtectedRoute and ORGANIZER RoleGuard.
  Preserve the strict role-aware allowlist of implemented post-login return routes.
- Key event reads by verified organizer and query/resource; abort obsolete work.
  Never show old organizer data after logout, session uncertainty, or identity change.
- Interpret local form times through Date conversion, never by appending Z.
  Preserve precision and date ordering; name the browser timezone in the UI.
- Parse rupee decimal text with exact integer arithmetic; store/send safe paise.
  Zero-price events work; reject negative/exponent/excess-precision input.
- Share create/edit validation; PATCH only changed fields. Published schedule,
  capacity, deadline, and price remain read-only; cancelled events stay read-only.
- Publish/cancel require accessible explicit confirmation. No optimistic status
  or success. Disable duplicate actions and refetch actual details after success.
- Preserve modal focus trapping/restoration, background inertness, and keyboard use.
- On 409, block resubmission and offer explicit reload/review of current state.
  An interrupted mutation may have committed; do not automatically retry it.
- Lists use bounded server pagination, URL filters, debounced search, and actual
  remaining capacity. Reset filters/search to page one; errors are never empty success.
- Dashboard recent events and totals come from a bounded API call, never fake metrics.
- Do not expose raw server errors, cookies, JWTs, or private model metadata;
  no event/auth browser-storage persistence. Keep frontend HTTP-boundary tests.

## Public discovery contract (Task 07)

- Read `docs/discovery.md` before changing public event queries or implementing booking.
- Keep GET `/api/events` and `/api/events/:id` public and database-readiness guarded,
  independent of JWT configuration. Do not weaken private organizer guards.
- Enforce PUBLISHED and startAt > now in both services. Draft/cancelled/past,
  missing, and malformed-ID public details share 404; private history stays available.
- Upcoming closed/sold-out events remain visible. Availability labels are snapshots,
  never reservation authority. Task 08 must revalidate inside its inventory transaction.
- Preserve dedicated public projection/mapper; never expose organizer/account data,
  model internals, credentials, or reservation/payment records in discovery.
- Strictly validate query enums, ISO offset boundaries, lengths, and bounded page/limit.
  Escape literal title/venue search, reject unknown/repeated/operator parameters.
- Use deterministic date/price/ObjectId ordering, MongoDB page/count aggregation,
  2-second query budgets, and additive verified schedule/price indexes.
- Reuse public typed API/hooks, shared price/date utilities, URL-applied filters,
  300 ms search debounce, stale-read abort/generation handling, and safe feedback.
- Public pages must work with guest/either-role/unresolved/unavailable auth. Keep
  private organizer request scoping and role-aware post-login destinations unchanged.
- Name the browser timezone, convert actual local date boundaries to UTC, and
  preserve inclusive exact-instant from/through semantics. No silent day expansion.
- Availability precedence: unavailable start/status, closed deadline, sold out,
  otherwise open. Update known time boundaries; re-read server data on refresh.
- Reservation CTA uses Task 08's actual attendee allocation; no fake booking,
  payment success, image artwork, reviews, recommendations, or popularity counts.
- Preserve real MongoDB visibility/query tests and frontend HTTP-boundary tests.

## Reservation contract (Task 08)

- Read `docs/reservations.md` before changing inventory, expiry or implementing Task 09.
- Reuse `modules/reservations`, the current single connection, session/role/Origin
  guards, explicit DTOs, and attendee-scoped client hooks. No reservation browser storage.
- One hold is one unit; server creation + 600000 ms; stored event price is immutable.
  All new holds, including free events, stay HELD. No automatic free confirmation.
- Allocation/release must update the same Event in their reservation transaction;
  preserve `$expr` capacity checks, version increments, rollback and active uniqueness.
- Check the counter against HELD + CONFIRMED in a consistent snapshot; fail closed
  on corruption. No TTL deletion, underflow clamp, casual repair or history removal.
- Only the winning conditional HELD transition releases inventory. Keep minute
  worker/lazy cleanup bounded, multi-instance safe, independently callable and
  explicitly started/stopped by server lifecycle; no import-time timers.
- Preserve the driver's bounded total transaction deadline and appropriate labelled
  retries. No side effects or parallel operations in one session; never blindly
  retry a duplicate insert or report an unresolved commit as success/failure.
- Frontend must check owned history after uncertain POSTs, abort obsolete reads,
  hide old identity data, and refetch after cancellation. Do not retry mutations automatically.
- Countdown is informational and uses server time; at zero disable hold actions and
  read the authoritative state before displaying EXPIRED. Reuse accessible dialogs.
- Task 09 confirmation must conditionally require HELD and expiresAt > server now,
  retain the existing unit/amount/deadline, and race safely with expiry/cancellation.
- `npm run test:reservations` owns a disposable replica set; CI/full tests include
  real 20-request capacity/duplicate races, exactly-once release and rollback checks.

## Verification and Git

- Read `docs/rubric-audit.md` for the Task 07.5 findings and future integration/deployment risks.
- Keep malformed URL encoding at safe 400 before router/static decoders, unsupported
  JSON charset/encoding at 415, and error responses no-store. Unexpected central logs
  retain request IDs/fixed metadata, never raw exception messages or credential values.
- Default HOST to loopback in development/test and 0.0.0.0 in production; respect
  explicit HOST/platform PORT. A copied local .env may override the production default.
- Publication page and confirmation controls share the boundary clock and expire
  at start/deadline. Backend checks remain authoritative; never imply success locally.
- Keep frontend test worker concurrency bounded and per-file isolation enabled.
  Do not hide timing failures by weakening assertions, raising waits blindly, or skipping suites.

- Use `npm ci` and `npm run check` (lint, types, all tests, both builds).
- `npm run test:unit` needs no MongoDB process; `npm run test:db` owns its replica set.
- `npm run test:auth` runs authentication unit and real HTTP/replica-set tests with ephemeral keys.
- `npm run test:events` runs event integration suites; `test:db` also includes them.
- `npm run test:discovery` runs public visibility/query integrations; `test:db` includes them.
- `npm run test:reservations` runs reservation HTTP/replica-set races, expiry and history; `test:db` includes it.
- `npm run test:web` runs frontend tests; `npm test` and CI include both workspaces.
- `npm run test:watch -w client` watches frontend tests; root `test:watch` watches backend tests.
- Keep changes small and coherent; use conventional commits and the configured authorized Git identity.
- Preserve existing work. Never fabricate/backdate commits, rewrite published history, or force-push.
- Avoid unnecessary repository restructuring. Never commit secrets, binaries, dependencies, or build output.
- Verify before publishing. Push successful completed work to GitHub and verify the remote head/CI.
- Report actual commit hashes, observed test results, and remaining blockers honestly.

## Remaining roadmap

- 03 — Authentication Backend (implemented; see verification record)
- 04 — Authentication Frontend (implemented; see verification record)
- 05 — Event Management Backend (implemented; see verification record)
- 06 — Event Management Frontend (implemented; see verification record)
- 07 — Event Discovery (implemented; see verification record)
- 08 — Reservation Engine (implemented; see verification record)
- 09 — Simulated Payment Gateway
- 10 — QR Ticketing
- 11 — Ticket Check-In
- 12 — Organizer Analytics
- 13 — Integration Testing & Hardening
- 14 — Production Release & Documentation

Future tasks must continue using MongoDB/Mongoose. Implement only the task the
user authorizes. Tasks 07 discovery and 08 reservations are implemented. Task 09
payment/confirmation is the next milestone and requires separate authorization.

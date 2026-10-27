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

## Simulated payment contract (Task 09)

- Read `docs/payments.md` before changing checkout, confirmations or implementing Task 10.
- Reuse `modules/payments`, existing session-aware reservation services and the one
  connection. No real gateway, money collection or financial credentials.
- Persist PENDING before finalization; every new request binds its immutable outcome,
  reservation amount and UUID v4 key. Preserve existing unique indexes and history.
- Same key/request replays its durable attempt; different outcome conflicts. A real
  failed retry gets a new key. Unknown responses retain the original key/outcome.
- Only a conditional valid HELD -> CONFIRMED transition may commit a corresponding
  SUCCESS. Commit both together; never change the unit, price or original deadline.
- Preserve fresh app-time and MongoDB $$NOW deadline predicates, event checks,
  bounded retries and serial transaction operations. Never confirm EXPIRED/CANCELLED.
- New Task 09 PENDING attempts must remain resumable, including finalizing as FAILED
  after expiry/cancellation/competing confirmation. No guessed terminal outcomes.
- Keep payment DTOs owner-scoped, history bounded, errors safe and POSTs Origin guarded.
- Frontend keys stay in the memory-only recovery provider across navigation, clear
  on logout/account change, and never enter browser storage. Check status/same-key
  resume on interruption; do not convert network errors into simulated declines.
- Task 10 must issue at most one QR ticket per genuinely CONFIRMED reservation,
  verify durable confirmation/payment evidence, and preserve ticket uniqueness.

## Ticket contract (Task 10)

- Read `docs/ticketing.md` before changing tickets or implementing Task 11.
- Reuse `modules/tickets`, existing auth/role/Origin/readiness guards, the single
  connection and bounded serial transaction primitive. No public verification API.
- Issue only for an owned CONFIRMED reservation, exactly one matching SUCCESS with
  durable original SUCCESS outcome/completion, and a PUBLISHED event. Free events
  require explicit zero-value checkout. Do not require event start to be future.
- Preserve the unique reservation and nonce indexes and original persisted identity.
  New issuance conditionally writes Event/Reservation/Payment versions together
  with insertion; public timestamps, inventory, amount, expiry and states stay intact.
- Ticket failure/uncertainty never changes successful payment or confirmation.
  Recover by owned wallet/detail reads and explicit idempotent reservation POST;
  never blindly retry insertion, replace an inactive ticket or issue during GET.
- Generate IDs/nonces only on the backend. Never hydrate/invent a nonce on reads.
  Preserve ticket history; no Ticket TTL (startup rejects it) or deletion. Task 10
  creates/reads only; Task 11 authorizes atomic USED transitions. Revocation creation
  remains a future workflow.
- Use independent strong canonical base64url TICKET_HMAC_SECRET, never JWT_SECRET
  or a client VITE_* key. Fail ticket configuration with 503 independently.
- Preserve minimal canonical v1 ID/nonce payload, domain-separated HMAC-SHA256,
  strict bounded input validation and length-checked crypto.timingSafeEqual.
  Never log QR credentials. Rotation invalidates old exports; no key ring exists.
- Wallets omit full credentials. Only owned active details/issuance return QR;
  used/revoked/unavailable evidence gets history with null QR. No QR browser storage,
  credential query strings, optimistic success or automatic POST retries.
- Reuse scoped attendee hooks and guards; abort/hide credentials on identity/session
  change. Keep readable Q-level QR with four-module white quiet zone and real PNG
  export, safe filenames and object URL cleanup; show recoverable render/export errors.
- A signed static QR is copyable and does not prove admission eligibility. Task 11
  must verify persisted nonce, current event/organizer/reservation/payment/time and
  atomically win ISSUED -> USED once. Do not trust signature or UI status alone.
- Preserve real disposable MongoDB 20-request issuance, isolation, rollback/unknown
  commit recovery, stable reconnect reads and eligibility-source race tests.

## Admission contract (Task 11)

- Read `docs/checkin.md` before changing check-in, ticket consumption or eligibility.
- Reuse strict server-only `verifyTicket`, compare the actual persisted nonce in
  constant time, and check current session/ORGANIZER role/owned Event. POST requires
  exact trusted Origin; private reads/writes are no-store and readiness guarded.
- Verify event association, ISSUED/null timestamp state, CONFIRMED reservation,
  exactly one matching durable SUCCESS payment and an existing attendee. Signature
  authenticity is never sufficient. Hide unrelated attendee/event information.
- Admission is `[startAt - 2 hours, endAt)` for PUBLISHED events. Registration
  deadlines and public upcoming discovery do not control admission. Invalid dates
  or unverifiable persisted state fail closed.
- Consume via one conditional Ticket update with exact ID/reservation/nonce,
  ISSUED and existing null checkedInAt; MongoDB $$NOW gates the write window and
  $currentDate sets the admission time. Use majority acknowledgement and bounded
  operations. Only the winning update returns approval; replay is 409 with the
  original timestamp. Never change inventory, confirmation, payment or identity.
- A single-document write relies on frozen published owner/schedule, terminal
  CONFIRMED/SUCCESS states, and cancellation blocked by CONFIRMED inventory. Future
  refunds, confirmed cancellation, transfer or mutable eligibility must coordinate
  with consumption; do not claim safety against arbitrary out-of-band edits.
- Preserve USED/REVOKED history and safe paginated event-owned DTOs. No CheckIn
  collection, TTL, public verification endpoint or read-driven mutation.
- Unexpected POST failure is uncertain (possibly committed), not approval/decline.
  History read failure is a distinct unavailable response, never fake empty success.
  No automatic mutation retries; explicit same-credential retry may return USED.
- Reuse scoped organizer hooks and shared API/auth handling. Hide obsolete identity
  data, abort stale reads, and release camera tracks/decoder/preview/pending starts
  on detection/stop/navigation/logout/unavailable session. Start only explicitly;
  request video only, decode locally, suppress repeated frames and pause for results.
- Manual full-credential entry uses the same server API. Credentials stay in memory
  only and clear on completion/next/unmount; retain uncertainty only for explicit
  retry. Never log/store credentials or place them in URLs. Fresh wallet reads show
  Already Used and original time with no active QR/download.
- Preserve real 20-request/split-scanner/independent-ticket/replay/reconnect and
  uncertain-commit tests. Real image decoding and mocked media tests do not prove
  physical-camera compatibility; report that verification separately.

## Verification and Git

### Analytics contract (Task 12)

- Read `docs/analytics.md` before changing reporting, formulas or activity timestamps.
- Reports are read-only and organizer-owned. Reuse readiness, live AuthSession and
  current persisted ORGANIZER role; never accept organizerId from the client.
  Scope Event ownership before joining records; private responses are no-store.
- Separate current/lifetime metrics from selected-period activity. Current active
  HELD requires expiresAt > generatedAt; elapsed HELD awaiting cleanup is separate.
  Use Event.reservedCount for occupied inventory; analytics must never run expiry,
  release capacity, repair counters or mutate any business record.
- Conversion is current CONFIRMED / all reservations from the same createdAt cohort.
  Attendance is cumulative valid USED / lifetime CONFIRMED. Zero or inconsistent
  denominators return null/N/A. No fabricated percentages or growth comparisons.
- Period event/reservation/ticket creation uses createdAt; successful simulated
  settlements use completedAt; failed/pending attempt cohorts use createdAt;
  check-in activity uses checkedInAt. Keep [from,to), explicit offset validation,
  custom range bounds, UTC bucket labels and at most 90 zero-filled points.
- Genuine simulated revenue requires exactly one durable matching SUCCESS for a
  CONFIRMED booking. Reduce retries before joining booking/ticket totals. Exclude
  duplicate/mismatched/legacy success evidence and expose safe aggregate diagnostics,
  never choose an arbitrary success or silently repair it. Free payments add zero.
- Validate safe integer source paise; convert Int64 -> Decimal128 before summing.
  JSON monetary totals are canonical integer strings, formatted through BigInt.
  Overflow, impossible inventory or missing aggregate envelopes fail closed.
- Keep aggregation scoped, projected, bounded and snapshot-read; existing indexes
  are additive/verified. No full collection materialization or per-event Node query
  loops. Combined overview supplies dashboard KPIs/trends/page in one request.
- Reuse owner-scoped abort/generation hooks and AuthProvider. Hide obsolete private
  data on filters, session uncertainty, logout or account change. Errors are never
  zero metrics. No browser persistence or optimistic reporting data.
- Keep charts accessible through labelled units/dates, keyboard bucket selection,
  complete data tables and genuine empty states. Label every financial value as
  simulated; do not imply money collected, refunds, net revenue, payouts or forecasts.
- Preserve disposable real aggregation fixtures, payment retry/replay-to-admission
  journeys, exact numeric/time-boundary cases, tenant isolation and read-only checks.
- Local load measurements are not production capacity guarantees; keep timeouts and
  report known limitations. Task 13 audit and Task 14 deployment remain separate.

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
- `npm run test:payments` runs real idempotency/pending/confirmation/race cases; `test:db` includes it.
- `npm run test:tickets` runs strict crypto and real ticket issuance/security/race cases; `test:db` includes its integrations.
- `npm run test:checkin` runs policy and real admission/security/race cases; normal tests/CI include it.
- `npm run test:analytics` runs numeric-integrity and real reporting accuracy/security tests; normal tests/CI include it.
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
- 09 — Simulated Payment Gateway (implemented; see verification record)
- 10 — QR Ticketing (implemented; see verification record)
- 11 — Ticket Check-In (implemented; see verification record)
- 12 — Organizer Analytics (implemented; see verification record)
- 13 — Integration Testing & Hardening
- 14 — Production Release & Documentation

Future tasks must continue using MongoDB/Mongoose. Implement only the task the
user authorizes. Tasks 07 discovery, 08 reservations and 09 simulated payments are
implemented, as are Task 10 QR ticketing, Task 11 single-use admission and Task 12
organizer analytics. Task 13 integration/hardening and Task 14 deployment require
separate authorization; do not start them as part of Task 12.

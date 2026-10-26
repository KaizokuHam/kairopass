# Implementation plan

## Scope and source

Task 02 establishes MongoDB + Mongoose as the permanent persistence layer and
supplies the authoritative remaining roadmap below, replacing the provisional
allocation recorded during Task 01. See `AGENTS.md` for persistent instructions
and `database.md` for model/integrity contracts. Future task briefs define the
detailed scope of each stage; do not implement later workflows prematurely.

Submission deadline: **October 27, 2026, 11:59 PM IST**.

| Task | Milestone | Status |
| --- | --- | --- |
| 01 | Repository, architecture, full-stack foundation, developer tooling, CI | Completed — implementation and local acceptance verified |
| 02 | MongoDB + Mongoose Architecture, Database Migration & Data Integrity | Completed — implementation and local acceptance verified |
| 03 | Authentication Backend | Completed — implementation and local acceptance verified |
| 04 | Authentication Frontend, Protected Routing & User Experience | Completed — implementation and local acceptance verified |
| 05 | Event Management Backend | Completed — implementation and local acceptance verified |
| 06 | Event Management Frontend | Completed — implementation and local acceptance verified |
| 07 | Event Discovery | Completed — implementation and local acceptance verified |
| 07.5 | Mid-project engineering and rubric audit | Completed — see rubric-audit.md for findings and verification |
| 08 | Reservation Engine | Completed — implementation and local acceptance verified |
| 09 | Simulated Payment Gateway | Next — not implemented |
| 10 | QR Ticketing | Upcoming |
| 11 | Ticket Check-In | Upcoming |
| 12 | Organizer Analytics | Upcoming |
| 13 | Integration Testing & Hardening | Upcoming |
| 14 | Production Release & Documentation | Upcoming |

## Task 01 acceptance record

Verified on **October 26, 2026 (IST)** with Node.js 24.14.0 and npm 11.9.0:

| Check | Observed result |
| --- | --- |
| GitHub account and repository creation | Authenticated as `KaizokuHam`; public `KaizokuHam/kairopass` created |
| Reproducible workspace installation | `npm ci` passed; 439 packages installed, no audit vulnerabilities reported |
| Lint | `npm run lint` passed with zero warnings |
| TypeScript | `npm run typecheck` passed in both workspaces |
| Automated tests | `npm test` passed: 28 tests across 2 files |
| Production builds | `npm run build` passed for client and server |
| Independent development startup | Both `npm run dev -w server` and `npm run dev -w client` started |
| Combined development startup | `npm run dev` started both workspaces |
| Backend health | HTTP 200 with the exact required JSON, without database configuration |
| Frontend API request | Browser displayed API connected through Vite's proxy |
| Failure feedback | Stopping the API produced API unavailable and a retry control; restart restored connectivity |
| Responsive shell | Desktop, 390px, and 320px browser checks; horizontal overflow fixed and rechecked |
| Browser navigation | Overview and vision routes rendered correctly |
| Compiled production startup | `NODE_ENV=production npm start` served API and client on port 4000 |
| Production smoke assertions | Health, `/`, `/vision`, real JS/CSS assets, and JSON 404s passed |
| Production browser connectivity | Compiled `/vision` rendered and displayed API connected on the same origin |
| Secret / artifact hygiene | No secret-pattern matches in project sources; `.env`, dependencies, and build output ignored and untracked |
| CI configuration | Push and PR workflow runs install, lint, types, tests, and builds with read-only repository access |

Git commits, final push, default branch, remote head, clean working tree, and the
observed GitHub Actions conclusion are checked at delivery. Live CI results are
available in [GitHub Actions](https://github.com/KaizokuHam/kairopass/actions/workflows/ci.yml);
configuration alone is not a claim that a remote run passed.

Regression coverage includes API 404s before SPA fallback, missing assets with and
without extensions, invalid/oversized JSON, private error handling, request-log
redaction, origin behavior, configuration failures, and a missing client build.

The Task 01 record above is historical. Task 02 adds the models and database
infrastructure, while preserving that application foundation.

## Task 02 acceptance record

Verified locally on **October 26, 2026 (IST)**:

- Mongoose 9.11.4 is the application database dependency; the superseded packages,
  reserved directory, connection variable, and active documentation were removed/replaced.
- Five timestamped, typed models define document validation and explicit indexes.
- Connection initialization verifies transactional topology and real index metadata;
  imports do not connect; liveness remains independent; readiness/guard return 503
  when unavailable; shutdown and reconnection are tested; logs never echo the URI.
- `npm run check` passed: zero-warning lint, strict types, **75 tests / 4 files**,
  and client/server production builds.
- **40 MongoDB integration tests** passed against an owned MongoDB 8.2.6 replica
  set, including actual unique/partial index failures, immutable price snapshots,
  history retention, ticket identity, transaction commit/rollback, standalone
  rejection, initial failure sanitization, and connection recovery.
- Tests ignore application database credentials and guard all disposable-data cleanup.
- CI runs all suites and builds, with a cache for the disposable MongoDB binary.
- `database.md` records transaction/expiration/payment/QR strategies and the
  boundaries that Mongoose validation and references cannot enforce.
- Root `AGENTS.md` records the permanent database choice, engineering/Git rules,
  and the supplied Tasks 03–14 roadmap.
- A fresh `npm ci` passed (368 installed packages, no reported vulnerabilities),
  followed by another successful full quality gate.
- Live compiled-server smoke checks passed against an owned replica set:
  liveness 200, readiness 200, SPA routes/assets, JSON API fallback, no logged URI.
  Without database configuration, the same compiled application kept liveness
  and frontend delivery working while returning readiness 503.
- Source/lockfile scans found no obsolete database configuration/dependencies;
  only the explicit prohibited-technology instruction in `AGENTS.md` names them.
  Frontend sources are unchanged from Task 01, and secret/artifact checks passed.

Remote commits and the observed CI conclusion are verified before delivery.
No Atlas account or persistent application
database is provisioned by the tests; a local replica set or an environment-provided
Atlas URI is required for ongoing database readiness. Authentication and business
workflows remain outside Task 02.

## Task 03 acceptance record

The authentication backend adds only register/login/me/logout, credential hashing,
JWT cookies and revocable sessions, persisted-role middleware, validation, rate
limits, and Origin-based CSRF defense. No Task 04 frontend or later business
workflow is implemented. See [authentication](authentication.md) for API examples,
configuration, startup behavior, and security limitations.

Verified during implementation on **October 26, 2026 (IST)**:

- The existing 75-test foundation passed before implementation; remote/account
  identity were checked and `main` was safely synchronized.
- `npm run test:auth` passed **90 tests**: 22 unit tests and 68 real HTTP integration
  tests against a test-owned replica set with ephemeral signing keys.
- Both public roles register; normalization, Argon2id verification, safe DTOs,
  duplicate races, transactional rollback, and generic login failures are tested.
- JWT claims/signature/expiry, invalid configuration, deleted users, missing/
  revoked/expired sessions, logout replay rejection, and independent sessions are tested.
- Isolated role routes verify 401/403 behavior and immediate persisted-role changes.
- JSON/input limits, no privilege-field escalation, both rate limiters, spoofed
  forwarding headers, exact Origin rejection/acceptance, credentialed CORS, and
  production cookie set/clear flags are tested.
- Database unavailability, dropped queries, malformed JSON, sanitized failures,
  and omission of passwords/tokens/secrets from request logs are tested.
- AuthSession indexes are additive, explicitly verified, and include session-only
  TTL cleanup. Existing business models and frontend sources remain unchanged.
- A fresh `npm ci` passed: 378 installed packages, no reported vulnerabilities.

- The final clean-install quality gate passed **165 tests across 6 files**, lint
  with zero warnings, strict TypeScript in both workspaces, and both builds.
- Live compiled-server smoke tests passed: registration 201, login/me/logout 200,
  copied-token replay 401, independent login retained, untrusted logout Origin 403,
  Secure/HttpOnly cookies, and no credential/URI values in logs.
- Invalid signing configuration and unavailable MongoDB each produced auth 503
  while liveness and frontend delivery remained 200.
- `npm run test:unit` passed **57 tests across 4 files** after quoting the exclusion
  glob for Windows/POSIX shell consistency; no MongoDB process is needed.

Secret/artifact hygiene, final remote commits, and CI conclusion are checked at
delivery. Ongoing application use requires
a persistent replica-set/Atlas URI, an actual generated JWT secret, and correct
origin settings. Test infrastructure provisions none of those as production resources.

## Task 04 acceptance record

Verified on **October 26, 2026 (IST)** with Node.js 24.14.0 and npm 11.9.0:

| Check | Observed result |
| --- | --- |
| Repository baseline | Verified origin/account, safely synchronized `main`; Task 03 baseline passed all 165 tests and quality gates |
| Typed API client | Same-origin relative GET/POST JSON, public-user runtime validation, safe typed errors, Retry-After, cancellation, and timeouts |
| Authentication state | Four explicit states, `/me` restoration/retry, mutation serialization, abort/generation protection, StrictMode/unmount coverage |
| Forms | Actual login/registration responses, both roles, validation, password visibility, disabled pending controls, preserved failed inputs, accessible errors |
| Route protection | Guests go to login after 401; initialization/unavailable gates hide private content; both wrong-role visits denied; return destinations allowlisted |
| Dashboards/navigation | Actual account details, responsive auth-aware shell/logout, honest static upcoming modules, no fake business data |
| Clean installation | `npm ci` passed: 439 installed packages, no reported vulnerabilities |
| Frontend tests | 60 passing tests across 5 files with real provider/router/forms and mocked HTTP boundaries |
| Backend regressions | All 165 existing tests across 6 files passed; backend implementation unchanged |
| Complete quality gate | `npm run check` passed: lint with zero warnings, both TypeScript checks, 225 total tests across 11 files, both production builds |
| Real attendee browser flow | Registration established session and opened attendee dashboard; reload restored it; login worked after logout |
| Real organizer browser flow | Organizer selection registered the actual role, opened organizer dashboard, and survived reload |
| Browser access control | Both cross-role visits denied; successful logout returned to public `/`; a later protected visit went to login |
| Local Origin integration | Real browser POSTs through Vite at `http://localhost:5173` succeeded with exact trusted Origin; no JavaScript Origin override |
| Responsive/accessibility checks | Desktop, 320px and 390px form/dashboard checks without horizontal overflow; compact menu and Escape/focus verified; no browser console warnings/errors observed |
| Compiled application | New login/register/dashboard browser routes serve SPA HTML; auth lifecycle, revocation replay rejection, independent sessions, CSRF, and Secure/HttpOnly flags passed |
| Failure isolation | Invalid JWT configuration and unavailable MongoDB return auth 503 while liveness/frontend remain 200 |
| Secret/artifact hygiene | No frontend cookie/storage/token access; `.env`, builds, browser proof, and temporary preview helpers ignored/untracked |

Manual testing used disposable `.test` accounts, an owned MongoDB 8.2.6 replica
set, and an ephemeral signing key. The preview processes and owned replica set
were stopped afterward. No production/shared data was used or cleaned.

The implementation is split into five conventional commits covering API/state,
forms, routes/dashboard/navigation, regression coverage, and documentation.
Final remote head and the observed push-triggered CI conclusion are checked at
delivery; current runs are available in
[GitHub Actions](https://github.com/KaizokuHam/kairopass/actions/workflows/ci.yml).

Persistent application use still requires an owned replica-set/Atlas database,
a generated JWT secret, and correct origin/HTTPS settings. There is no proactive
cross-tab synchronization, background session renewal, password reset, OAuth,
or account-settings workflow. Dashboards remain account shells; event management,
discovery, reservations, payments, ticketing, check-in, and analytics are future
work. Task 05 is ready to begin when separately authorized and is not implemented here.

## Task 05 acceptance record

Verified on **October 26, 2026 (IST)** with Node.js 24.14.0 and npm 11.9.0:

| Check | Observed result |
| --- | --- |
| Dependency and repository baseline | Task 04 landed at fb4ec4e; clean main safely synchronized; baseline 225 tests, lint, types, and builds passed |
| Module architecture | Routes/controllers/services/Zod/types/mapper; reused Event model, one Mongoose connection, existing auth/Origin/readiness guards |
| Draft creation | Persisted owner from authenticated context, DRAFT, zero inventory; strict date/capacity/paise validation and protected-field rejection |
| Organizer queries | Owned list/detail, bounded pagination, status filter, deterministic newest/oldest ordering, escaped literal search, explicit DTO and total metadata |
| Editing | Complete merged-state and model validation; draft editing; published descriptive edits only; cancelled records immutable through API |
| Publishing | Conditional DRAFT transition, valid future start/deadline, repeated/invalid transitions return 409 |
| Cancellation | Zero counter plus defensive HELD/CONFIRMED checks in a snapshot transaction; no deletion, inventory mutation, refunds, or fake success |
| Ownership and security | All mutations reject attendees/unauthed/untrusted Origins; missing/unowned resources return 404; current persisted role and revoked sessions enforced |
| Concurrency | Controlled real-read barriers verify competing edits, edit/publish, publish/cancel, transaction retry, and real allocation-versus-cancellation safety |
| Indexes | Additive eventId/status reservation lookup index verified in MongoDB; existing Event schema/indexes and reservation history constraints retained |
| Event suite | 94 tests across 3 real integration files; controlled dates and owned disposable replica sets with ephemeral keys |
| Regression suites | All 165 existing backend tests / 6 files and 60 frontend tests / 5 files passed |
| Reproducible install | npm ci passed: 439 installed packages, no reported vulnerabilities |
| Complete quality gate | npm run check passed: zero-warning lint, both strict TypeScript checks, 319 tests / 14 files, both production builds |
| Compiled-server smoke | Real create/list/detail/edit/publish/cancel; private ownership, attendee rejection, CSRF, frozen economics, retained history, logout replay rejection, safe logs, frontend delivery |
| Fail-closed smoke | Invalid JWT configuration and unavailable MongoDB each returned private event 503 while health and compiled frontend remained 200 |
| Scope/artifact hygiene | Client unchanged from Task 04; public /api/events and DELETE absent; no secrets, environment files, dependencies, builds, or smoke helpers tracked |

`npm run test:events` targets the new suites. `test:db`, `npm test`, the quality
gate, and normal GitHub Actions CI include them. Temporary test/smoke servers
own and stop their MongoDB instances; application/production data is never cleaned.

Five coherent conventional commits cover draft creation, owned queries, lifecycle
operations, concurrency/security coverage, and documentation. Final remote head,
clean working tree, and the push-triggered CI conclusion are verified at delivery.
See [GitHub Actions](https://github.com/KaizokuHam/kairopass/actions/workflows/ci.yml).

Known limits: no event frontend or public discovery yet, no hard deletion,
refund/cancellation orchestration, inventory repair, or reservation API. Optimistic
checks protect overlapping server operations, not old browser forms submitted
after another operation has already completed. Task 08 must update the same
published event and insert reservations atomically for cross-module safety.
Persistent use still requires an owned replica-set/Atlas database, generated JWT
key, and correct origin settings. Task 06 can begin when separately authorized.

## Task 06 acceptance record

Verified on **October 26, 2026 (IST)** with Node.js 24.14.0 and npm 11.9.0:

| Check | Observed result |
| --- | --- |
| Prerequisites | Tasks 04/05 landed; repository/identity/remote checked and synchronized; baseline quality gate passed |
| Typed API integration | Six actual organizer endpoints, relative same-origin GET/POST/PATCH, strict event/pagination parsing, safe domain errors and validation paths |
| Request safety | Verified-identity-scoped reads, abort/generation protection, duplicate-mutation mutex, session revalidation, logout/account-change isolation |
| Create/edit forms | One accessible shared form; backend-compatible limits, inline errors, preserved failed input, only permitted changed PATCH fields |
| Currency and dates | Exact BigInt decimal-to-paise conversion, free events, safe-integer bounds, local-time/ISO round trips including subsecond precision and invalid-calendar rejection |
| List/detail | Actual API data, remaining capacity, URL filters, 350 ms search debounce, sorting/page size, server pagination, distinct loading/empty/failure states |
| Lifecycle | Explicit accessible publish/cancel dialogs, no optimistic success, pending-action lock, fresh detail GETs, conflict reload/review, terminal cancelled views |
| Dashboard/navigation | Functional workspace links, newest three actual events and API total, no fabricated draft/published counts or analytics |
| New frontend tests | 76 new tests across 6 files, supplementing the original 60; 136 total frontend tests across 11 files |
| Backend regressions | All 259 tests across 9 files passed, including 94 real event integration tests; server source unchanged from Task 05 |
| Clean installation | npm ci passed: 439 installed packages, no reported vulnerabilities |
| Complete quality gate | npm run check passed: zero-warning lint, both TypeScript checks, 395 tests across 20 files, both production builds |
| Real browser lifecycle | Disposable organizer created/edited/confirmed publication, changed permitted published venue, cancelled an eligible event, and verified terminal status after reload |
| Real pricing/time | Paid ₹199.00 and free ₹0.00 events persisted; chosen local schedule displayed correctly after retrieval/refresh |
| Browser queries/workspace | Status filter, debounced no-match search, clearing filters, oldest/newest ordering, page 1/2 navigation, live dashboard total/recent links |
| Browser authorization | Another organizer saw safe not-found without prior account data; attendee denied organizer pages; signed-out event navigation redirected to login |
| Responsive/dialog checks | Desktop, 768px tablet, and 375px mobile checks without page overflow; mobile form submission and publication dialog worked; Escape/focus return verified |
| Compiled server | All new organizer SPA routes/assets served successfully; actual event API lifecycle/security and fail-closed unavailable-state smoke checks passed |
| Hygiene/scope | No backend/database/dependency changes, no browser token/cookie/storage access, no tracked secrets/builds/preview helpers; Task 07 remains unimplemented |

Browser verification used actual HTTP APIs and MongoDB records in an owned
MongoDB 8.2.6 replica set, disposable `.test` accounts, and an ephemeral signing
key. Preview processes and the owned replica set were stopped. Screenshots,
recovery snapshots, and helpers remain in ignored artifacts; no shared/production
database was used or cleaned.

Five coherent commits cover API/hooks, forms, list/detail routes, lifecycle/
dashboard integration and regressions, and documentation. Final remote head,
clean working tree, and push-triggered GitHub Actions conclusion are verified
at delivery. Current runs are available in
[GitHub Actions](https://github.com/KaizokuHam/kairopass/actions/workflows/ci.yml).

Known limits: no public discovery, reservation/payment/ticket workflows, refunds,
offline mutation queue, or separate timezone selector. Interrupted mutations
can already have reached the server, so review/reload before retrying. The
backend has no client revision/ETag contract for long-lived old forms; 409
conflicts require explicit reload. Persistent use requires configured owned
replica-set/Atlas storage, JWT credentials, and correct origins/HTTPS. Task 07
can begin when separately authorized; it is not implemented by this task.

## Task 07 acceptance record

Verified on **October 26, 2026 (IST)** with Node.js 24.14.0 and npm 11.9.0:

| Check | Observed result |
| --- | --- |
| Prerequisites/repository | Tasks 04–06 pushed, clean main at 896ab28; GitHub identity/remote checked, safely fetched/synchronized; baseline 395 tests plus lint/types/builds passed |
| Public API | GET /api/events and /api/events/:id work without authentication, including unavailable JWT configuration with a ready MongoDB connection |
| Visibility | Both services enforce PUBLISHED and startAt > now; draft/cancelled/past/missing/malformed-ID details share safe 404; private organizer history retained |
| Queries | Case-insensitive escaped title/venue substrings, venue/price/UTC date filters, combined predicates, four stable sort orders, server pagination/counts |
| Input safety | Strict query schema, bounded lengths/page/limit, explicit date offsets/calendar/range validation, duplicate/unknown/operator rejection |
| Public data boundary | Dedicated twelve-field projection/mapper, no organizer/account join, no internal/private/auth/reservation/payment fields |
| Database performance | Additive schedule/price indexes verified in real MongoDB; existing indexes retained; page/count aggregation and 2-second execution budgets |
| Frontend marketplace | Actual API cards, exact paise price/free display, remaining capacity, date-based artwork, 300 ms server-backed search, URL state, sort/filter/pagination |
| State/error handling | Obsolete reads aborted/ignored, key changes immediately hide prior data; loading/empty/search/filter/not-found/service errors distinct and retryable where appropriate |
| Public details/availability | Actual description/venue/start/end/deadline/price/capacity; deterministic unavailable/closed/sold-out/open precedence; exact clock-boundary updates |
| Scope/authentication | Public pages work for guest/either role/unresolved/unavailable auth; existing private role/ownership/Origin/session protections preserved; reservation CTA disabled in every state |
| Navigation | Public navigation/home CTA/attendee dashboard reach /events; detail links carry search state and return to the same filters; organizer workspace links preserved |
| New backend tests | 52 HTTP/real MongoDB integration cases plus 2 disconnected-route checks; all 259 prior backend regressions remain active (313 total / 10 files) |
| New frontend tests | 63 discovery HTTP/query/page/detail/clock/lifecycle cases; all prior authentication/organizer regressions retained (199 total / 14 files) |
| Clean installation | npm ci passed: 439 packages installed, 442 audited, zero reported vulnerabilities |
| Complete clean-install gate | npm run check passed: zero-warning lint, strict TypeScript in both workspaces, 512 tests / 24 files, both production builds |
| Real browser lifecycle | Registered disposable organizer; created paid Design After Hours draft; confirmed no public visibility; published through confirmation; public listing/search/filter/details/refresh matched; cancelled through confirmation; discovery removed it and private history retained it |
| Real browser queries/data | Created/published Community Product Lab (free, capacity 25) and Cloud Engineering Workshop (₹299.50, capacity 60); verified price/venue/local-date filters, price sorting, and actual page 1/2 navigation |
| Real browser public roles | Signed out and browsed anonymously; registered attendee and followed dashboard Explore Events action; no fictitious bookings or counts |
| Responsive/console | Default desktop, 375px mobile, and 768px tablet inspected; no page horizontal overflow; mobile collapsible filters and public free-event details worked; captured warn/error logs were empty |
| Compiled production smoke | Real draft/publish/cancel visibility, explicit public DTO, search/filter/pagination, frozen economics, retained history, logout revocation, safe logs, SPA routes and actual assets passed |
| Compiled failure modes | Invalid JWT: public discovery 200/private management 503; unavailable DB: discovery/private management 503; health/frontend/assets remained 200 in both modes |
| Artifact/scope hygiene | No new dependencies, secrets, application environment, generated output, preview helpers, screenshots, production fixtures, or later workflow endpoints tracked |

All database checks use owned unique MongoDB 8.2.6 replica sets, ephemeral signing
keys, and disposable `.test` accounts. They do not clean an application/Atlas
database. Browser tab/viewport overrides were cleaned up; owned preview and smoke
processes were stopped. Screenshots and execution logs remain in ignored artifacts.
The current public marketplace screenshot shows actual persisted browser-created
events, not a hardcoded component fixture.

Five coherent conventional commits cover public APIs, query capabilities,
marketplace, public details/navigation, and documentation. Existing CI automatically
discovers the new suites through npm test. The final push, remote HEAD, clean tree,
and exact-revision GitHub Actions conclusion are checked at delivery; see
[GitHub Actions](https://github.com/KaizokuHam/kairopass/actions/workflows/ci.yml).

Known limits: public history is deliberately excluded; substring search and
skip/limit suit the current MVP rather than unlimited datasets; inventory/status
are loaded snapshots and clock labels use the device clock. Persistent application
use still requires owned replica-set/Atlas storage and configured JWT/Origins for
account management. No reservation/payment/ticket/QR workflow, artwork upload,
recommendations, background inventory push, or external search system is implemented.
There are no unresolved Task 07 implementation or manual-smoke blockers.

Ready for **Task 08/14 — Reservation Engine, Atomic Inventory Management & Expiring
Ticket Holds** when separately authorized. Every actual allocation must revalidate
event status, times, deadline, and inventory transactionally; discovery labels are
never booking authority. Task 08 has not been started.

## Task 08 acceptance record

Verified on **October 26, 2026 (Asia/Calcutta)** with Node.js 24.14.0 and npm 11.9.0.
This record supersedes earlier forward-looking reservation placeholders.

| Check | Observed result |
| --- | --- |
| Repository/prerequisites | Verified KaizokuHam/kairopass, synchronized main at 57781d1; audit CI was successful; no conflicting edits; clean-install 522-test baseline passed |
| Reproducible installation | npm ci: 439 installed, 442 audited, zero vulnerabilities; no new dependencies |
| API/auth/ownership | Four attendee-only readiness/session/current-role guarded endpoints; POST exact-Origin protection; strict bodies/query/IDs; missing/unowned resource 404; safe explicit DTOs and no-store |
| Allocation | One unit per HELD; server creation + 600000 ms; immutable database price; future/PUBLISHED/open checks; conditional `$expr` capacity increment and insertion in one majority transaction |
| Retry/recovery | Driver retries within an 8-second total transaction deadline; duplicate winner recovered by read; forced real commit followed by lost response returns uncertain 503 and history resolves it |
| Expiration/cancellation | Conditional terminal transition and release commit together; repeated cancellation/cleanup harmless; due cancellation resolves EXPIRED; CONFIRMED remains allocated and cannot be cancelled here |
| Worker | Explicit startup after readiness, initial/minute batches, 50-candidate bound, one in-flight batch, multi-instance-safe transitions, no import timer, cooperative stop and real in-flight transaction drain |
| Lazy/history reads | Up to 100 due event holds plus own elapsed hold; owned detail reconciliation; bounded owned history reconciliation, newest stable pagination/filter; terminal missing-event history retained |
| 1 ticket / 20 requests | Exactly 1 new hold, 19 EVENT_SOLD_OUT conflicts, counter and active count both 1 |
| 5 tickets / 20 requests | Exactly 5 new holds, 15 EVENT_SOLD_OUT conflicts, counter and active count both 5 |
| Same user / 20 requests | Exactly 1 creation + 19 existing-hold responses; one ID, one unchanged expiry, one unit |
| Double expiration | One true transition and one no-op; one retained EXPIRED record, counter 0 |
| Cancel versus expiry | Returned EXPIRED, one release, repeat cancel harmless, counter 0 |
| Booking versus organizer cancel | One legal winner; either published event with one hold or cancelled event with none; both cannot commit inconsistent state |
| Rollback/price/confirmed | Forced insert failure leaves 0 allocations; exact maximum safe paise retained after later changes; free allocation remains HELD; controlled confirmed fixture survives cleanup without a ticket |
| Invariant proof | Same-snapshot comparisons of Event counter and HELD+CONFIRMED counts after booking/rejection/cancel/expiry/races/rollback; corrupted counter fails closed without repair |
| Frontend | Real Reserve + safe login return, attendee role guards, typed API and scoped reads/mutations, history/status/pagination, details/countdown, accessible cancellation and dashboard links |
| Recovery/isolation | Unknown POST outcomes prompt history checks; no automatic mutation retry or optimistic booking; obsolete GETs aborted/ignored; 401 revalidates, DB 503 preserves session; logout hides private data |
| Frontend regression coverage | 43 new HTTP-boundary/interaction cases; old discovery/dashboard placeholder assertions updated for implemented behavior; 244 frontend tests total |
| Backend regression coverage | 47 new real HTTP/replica-set cases; all 321 previous backend tests retained; 368 backend tests total |
| Complete quality gate | npm run check: lint with zero warnings, strict types in both workspaces, 612 tests across 27 files, both production builds; no failing/skipped cases |
| Real browser capacity 2 | Organizer created/published paid event; A/B filled it; C saw sold out/zero capacity; A cancelled; C saw one place and reserved it |
| Real browser expiry/history | Owned test fixture elapsed C's hold; actual GET confirmed EXPIRED and release; C reserved again; own list retained expired + current hold and status filter worked; DB showed 2 HELD + 1 CANCELLED + 1 EXPIRED, reservedCount 2 |
| Browser responsive/accessibility | 1440 desktop, 768 tablet, 375 mobile; no horizontal overflow; mobile cancellation dismissed safely with focus return; no captured warn/error console logs; screenshots retained in ignored artifacts |
| Compiled production smoke | Real capacity-two workflow produced third-attendee 409 EVENT_SOLD_OUT; owned 404, original hold/price/deadline, cancel/reuse, revoked-session rejection, Secure/HttpOnly cookies, SPA routes/assets, safe logs |
| Autonomous compiled worker | Controlled due fixture became EXPIRED through the actual minute worker without a reservation GET; one inventory release, next hold/history preserved, no payment/ticket records |
| Compiled failure/shutdown checks | Invalid JWT and unavailable DB gave reservation 503 while health/frontend/assets stayed available; real server shutdown listener drained worker/database and exited cleanly through a Windows-compatible test wrapper |
| Artifact/scope hygiene | No new production fixtures, secrets, environment files, generated output, dependencies, screenshots or temporary smoke/preview helpers tracked; no Task 09–12 workflow added |

The focused `npm run test:reservations`, `test:db`, normal `npm test`, and CI include
the new backend suite. Every database test owns a unique disposable MongoDB 8.2.6
replica set and ignores application MONGODB_URI for cleanup. Browser/compiled smoke
use owned disposable accounts/databases and ephemeral signing keys. Preview processes
and browser viewport/tab overrides were cleaned up.

Coherent conventional commits cover the atomic engine, resilience/batches, typed
client, attendee screens/navigation, HTTP-boundary frontend regressions, shutdown
coordination and documentation. Final remote SHA, clean tree and exact-revision
push-triggered CI conclusion are verified at delivery; see
[GitHub Actions](https://github.com/KaizokuHam/kairopass/actions/workflows/ci.yml).

Known limits: cleanup is a process-local best-effort scheduler (50 per batch per
minute), can lag under backlog/outage, and needs monitoring/capacity planning in a
real deployment. Corruption fails closed and requires investigation. Listing large
overdue histories may return a documented retryable 503 after bounded progress.
Public inventory remains a snapshot. Production Atlas/HTTPS/proxy/load verification
remains a release task; local smoke is not a hosted deployment. No checkout, payment
attempts/confirmation (including free events), refunds, tickets/QR, check-in or
analytics are implemented. Payment processing is explicitly marked as the next milestone.

Ready for **Task 09/14 — Simulated Payment Gateway, Idempotency, Payment Retries &
Reservation Confirmation** when separately authorized. It must require HELD and
expiresAt > server now, retain the allocated unit/price/original deadline, and race
transactionally with expiry/cancellation. See [the reservation contract](reservations.md).

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
| 06 | Event Management Frontend | Next — not implemented |
| 07 | Event Discovery | Upcoming |
| 08 | Reservation Engine | Upcoming |
| 09 | Simulated Payment Gateway | Upcoming |
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

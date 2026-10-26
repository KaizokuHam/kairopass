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
| 04 | Authentication Frontend, Protected Routing & User Experience | Next — not implemented |
| 05 | Event Management Backend | Upcoming |
| 06 | Event Management Frontend | Upcoming |
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

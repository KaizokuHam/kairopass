# KairoPass

A full-stack event booking platform with simulated payments, secure QR ticketing,
and organizer analytics. Built as a modular monolith for an academic software
engineering evaluation. The permanent stack is MERN: MongoDB, Express, React,
and Node.js, with Mongoose as the only database layer.

## Problem and users

Event discovery, booking records, payment state, and entrance verification often
live in disconnected tools. KairoPass will bring the complete journey into one
application for attendees and organizers. Attendees will discover events and
manage their tickets; organizers will publish events, manage capacity, check in
guests, and understand attendance.

## Product workflows

1. Organizer event creation and management through the complete private organizer workspace.
2. Event discovery and ticket reservations.
3. Database-backed simulated payment processing and confirmation.
4. Signed QR ticket issuance and secure check-in.
5. Organizer analytics and reporting.

Payments will be simulated. No real card processing or real payment collection
is planned. Public discovery and ten-minute ticket reservations are available.
Payment processing, confirmation, and digital tickets remain upcoming after Task 08.

## Stack and architecture

- React, Vite, TypeScript, Tailwind CSS, React Router, shadcn/ui-compatible structure.
- Node.js 24, Express 5, TypeScript, Zod.
- MongoDB replica set / MongoDB Atlas, Mongoose 9, explicit indexes and transaction-ready infrastructure.
- Argon2id passwords, HTTP-only JWT cookies, MongoDB-backed sessions, and persisted-role authorization.
- Vitest, React Testing Library, jsdom, Supertest, ESLint, npm workspaces, GitHub Actions.

The browser uses relative `/api` URLs. Vite proxies them to Express during
development. In production, Express serves both the compiled client and API on
one origin. Business modules will live under `server/src/modules`; route
handlers, business rules, and database access will have separate responsibilities.
See [architecture](docs/architecture.md) and [implementation plan](docs/implementation-plan.md).

## Local setup

Use Node.js **24.14+ on the 24.x line** and npm **11+**. `.nvmrc` selects 24.14.0.

```sh
npm ci
# PowerShell:
Copy-Item .env.example .env
# macOS / Linux alternative: cp .env.example .env
npm run dev
```

The web app runs at <http://localhost:5173> and the API at
<http://127.0.0.1:4000>. The shell and `/api/health` work without a database;
`/api/ready` returns 503 until MongoDB is ready. For full database readiness, start
an owned MongoDB replica set and initialize it as described in
[database setup](docs/database.md#local-development). A standalone server is rejected.
Registration, login, session restoration, and logout require database readiness
and valid JWT configuration. Open Vite at **http://localhost:5173**, matching
`CLIENT_ORIGIN`; `127.0.0.1:5173` is a different Origin and is not silently trusted.
The `/api` proxy continues to target `http://127.0.0.1:4000`.

| Command | Purpose |
| --- | --- |
| `npm install` | Install after intentionally changing dependency manifests |
| `npm ci` | Reproduce the committed lockfile across both workspaces |
| `npm run dev` | Start Vite and Express together; stop both with Ctrl+C |
| `npm run dev -w client` | Start the frontend independently |
| `npm run dev -w server` | Start the backend independently |
| `npm run lint` | Lint the repository, rejecting warnings |
| `npm run typecheck` | Type-check both workspaces |
| `npm test` | Run frontend, HTTP, configuration, and real MongoDB integration tests |
| `npm run test:web` | Run frontend API, state, forms, routing, and validation tests |
| `npm run test:watch -w client` | Run frontend tests in watch mode |
| `npm run test:unit` | Run HTTP/configuration/disconnected guard tests without MongoDB |
| `npm run test:db` | Start an owned disposable MongoDB replica set and run database tests |
| `npm run test:auth` | Run authentication unit and real HTTP integration tests |
| `npm run test:events` | Run event ownership, validation, lifecycle, and concurrency integration tests |
| `npm run test:discovery` | Run public visibility, search, filtering, and pagination integration tests |
| `npm run test:reservations` | Run real allocation, expiry, cancellation, ownership, and concurrency tests |
| `npm run test:watch` | Run backend tests in watch mode |
| `npm run build` | Compile client and server |
| `npm run check` | Run lint, type checks, tests, and builds |
| `npm start` | Start the compiled Express server |

## Environment

Copy the documented [`.env.example`](.env.example) into the repository root.
`PORT`, `HOST`, `NODE_ENV`, `CLIENT_ORIGIN`, `API_PROXY_TARGET`, and `LOG_LEVEL`
configure the foundation. If you change `PORT`, also update `API_PROXY_TARGET`
and any explicit `APP_ORIGIN`.
Without an explicit `HOST`, development/test bind to `127.0.0.1` and production
binds to `0.0.0.0`, accepting the platform-provided `PORT`. When copying the local
example into a hosted environment, replace its explicit `HOST=127.0.0.1` with
`HOST=0.0.0.0` or omit HOST. An explicit bind address is always respected.
`MONGODB_URI` selects the application database. The example uses an initialized
local `rs0` replica set. Production uses an environment-provided Atlas URI; no real
URI is committed. Replace the `JWT_SECRET` placeholder with a fresh base64url
signing key before using authentication:

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Paste the result only into the ignored `.env` or a secret store. JWT lifetime
defaults to 12 hours. Production requires an explicit HTTPS `APP_ORIGIN` and
always uses Secure cookies. Missing/weak JWT configuration leaves liveness
available but makes auth endpoints return 503; no fallback secret exists.
See [authentication setup and API](docs/authentication.md) for Origin, cookie,
rate-limit, proxy, and credential requirements.
Never put secrets in `VITE_*` variables: Vite exposes those to the
browser. Environment files, dependencies, and build output are ignored by Git.

For a production preview, first run `npm run build`, set `NODE_ENV=production`
in your environment, then run `npm start`. For example, in PowerShell:

```powershell
$env:NODE_ENV = 'production'
npm start
```

Open <http://127.0.0.1:4000>. Restore development mode afterward with
`Remove-Item Env:NODE_ENV`. Database readiness requires a reachable transactional
MongoDB deployment; the liveness endpoint remains independent.

## Repository layout

```text
.
├── client/
│   ├── public/                 # Static brand asset
│   ├── src/
│   │   ├── components/ui/      # Reusable UI primitives
│   │   ├── pages/              # Public/auth pages, dashboards, organizer event pages, 404
│   │   ├── layouts/            # Navigation, main content, footer
│   │   ├── hooks/              # Auth, health, scoped event reads and mutations
│   │   ├── services/           # Relative-path HTTP client
│   │   ├── context/            # In-memory session state and request coordination
│   │   ├── lib/                # Form validation, safe destinations, styling
│   │   ├── tests/              # Frontend HTTP-boundary and interaction tests
│   │   ├── types/              # Client API contracts
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── components.json         # shadcn/ui conventions and aliases
├── server/
│   ├── src/
│   │   ├── modules/auth/       # Routes, controllers, services, validation, JWT/password utilities
│   │   ├── modules/events/     # Private organizer event management, lifecycle, and DTOs
│   │   ├── modules/discovery/  # Public upcoming-event search, filtering, pagination, and safe DTOs
│   │   ├── modules/reservations/ # Atomic holds, owned history, cancellation and expiry worker
│   │   ├── models/             # Five business models plus AuthSession and verified indexes
│   │   ├── types/              # Public response DTOs
│   │   ├── middleware/         # Logging, errors, API 404
│   │   ├── config/             # Zod environment and MongoDB lifecycle/readiness
│   │   ├── lib/                # API error class
│   │   ├── app.ts              # Testable Express factory
│   │   └── server.ts           # HTTP lifecycle
│   └── tests/                  # HTTP, config, disposable replica-set tests
├── docs/
│   ├── architecture.md
│   ├── authentication.md
│   ├── database.md
│   ├── events.md
│   └── implementation-plan.md
├── .github/workflows/ci.yml
├── .env.example
├── AGENTS.md
├── package.json
├── package-lock.json
└── LICENSE
```

## API foundation

`GET /api/health` is a database-independent liveness check:

```json
{ "success": true, "message": "KairoPass API is running" }
```

Errors consistently return `success: false` with `error.code`, `error.message`,
and `error.requestId`. The response's `X-Request-Id` matches the identifier in
request logs. Unknown `/api` routes return JSON 404s, including in production;
missing assets are never replaced with SPA HTML. The app rejects malformed or
oversized JSON and hides internal error details.

`GET /api/ready` returns 200 only after the connection, replica-set/sharded
topology, required indexes, and bounded database ping succeed. Otherwise it
returns a consistent 503 `DATABASE_UNAVAILABLE` error. Initial database failures
are reported without leaking credentials; restart the API after correcting them.
Database-backed routers in later tasks must use the exported readiness guard.

## Authentication API

| Method / endpoint | Behavior |
| --- | --- |
| `POST /api/auth/register` | Validate attendee/organizer input, hash password, atomically create user/session; 201 |
| `POST /api/auth/login` | Verify credentials, create session, set HTTP-only JWT cookie; 200 |
| `GET /api/auth/me` | Verify JWT, active session, and current persisted user; 200 or 401 |
| `POST /api/auth/logout` | Revoke only the current session, clear cookie; 200 |

Unsafe auth requests require an exact trusted Origin; registration/login also
require JSON and have separate per-IP limits. No token or password hash is
returned in JSON. [Authentication documentation](docs/authentication.md) contains
example requests/responses and the security/deployment trade-offs.

The CI workflow runs `npm ci`, lint, type checks, tests, and production builds
on pushes and pull requests. Tests start their own MongoDB replica set; no shared
database, Atlas credentials, or deployment secrets are required. The first DB test
run may download MongoDB 8.2.6 from the official binary distribution. Tests never
read application `MONGODB_URI` for data cleanup.

## Authentication experience

| Route | Behavior |
| --- | --- |
| `/`, `/vision` | Public overview and roadmap |
| `/events`, `/events/:id` | Public upcoming marketplace and event details; no sign-in required |
| `/login`, `/register` | Accessible forms; authenticated users return to their own dashboard |
| `/attendee/dashboard` | Attendee account overview, Explore Events and My Reservations navigation |
| `/attendee/reservations`, `/attendee/reservations/:id` | Protected attendee history, hold countdown, and cancellation |
| `/organizer/dashboard` | Account overview, live recent events, functional event-management navigation |

Registration signs the user in immediately using the real API response. Refresh
restores identity through `/api/auth/me`; only a 401 confirms a signed-out session.
Network/server failures show a retryable unavailable state and hide protected
content. Wrong-role dashboard visits show an access-denied screen. Logout returns
to the public page only after backend revocation succeeds. Account data comes
from the backend; dashboards contain no fabricated events, counts, or revenue.

`AuthProvider` keeps public user state in memory, cancels superseded reads, and
serializes account mutations. Tokens remain in HTTP-only cookies; JavaScript
does not read cookies or use browser storage. See the
[frontend architecture and recovery behavior](docs/authentication.md#frontend-session-and-routing).

## Implementation status

**Current milestone: Task 08 implemented.** Attendees can reserve one ticket for
ten minutes, view retained history, and cancel a valid hold. MongoDB transactions
allocate/release capacity atomically, an explicit minute worker and lazy cleanup
expire holds, and duplicate requests return the original valid hold. Every new
reservation remains HELD, including free events. No payment or ticket is created.
See [reservation APIs, invariants and recovery](docs/reservations.md) and the
[Task 08 acceptance record](docs/implementation-plan.md#task-08-acceptance-record).
The local quality gate passes **612 tests / 27 files** (244 frontend, 368 backend),
lint, strict types and both builds. Earlier milestone records below are historical.

Tasks 01–02 establish the application and MongoDB foundation. Task 03 adds the
four authentication endpoints, Argon2id passwords, revocable JWT sessions,
authorization middleware, rate limiting, and CSRF defenses. Authentication-specific
verification passes **90 tests**, including **68 real HTTP integration tests**
against an owned replica set. The full quality gate passes **165 tests / 6 files**,
lint, strict types, and both builds after a clean install. Compiled-server smoke
checks verify registration/login/me/logout, copied-token rejection, independent
sessions, CSRF, cookie flags, and safe failures with invalid JWT configuration or
unavailable MongoDB. The unit-only command separately passes **57 tests**.

Task 04 adds the real authentication frontend, protected routes, role dashboards,
and responsive navigation. The clean-install quality gate passes **225 tests**:
**60 frontend tests / 5 files** and **165 backend tests / 6 files**, plus lint,
strict types, and both production builds. Real-browser checks cover both roles,
session restoration, login/logout, cross-role rejection, and responsive layouts.
Its verification record is in the
[implementation plan](docs/implementation-plan.md#task-04-acceptance-record).
The backend security implementation, business models, proxy target, and production
single-origin serving are preserved. See
[CI runs](https://github.com/KaizokuHam/kairopass/actions/workflows/ci.yml) for remote
verification and [database architecture](docs/database.md) for data-integrity limits.

Task 05 adds six private organizer event endpoints for draft creation, scoped
listing/detail, editing, publication, and safe cancellation. Strict input schemas,
ownership filters, conditional writes, and a cancellation transaction preserve
lifecycle and inventory rules. See [event API contracts](docs/events.md) and the
[Task 05 acceptance record](docs/implementation-plan.md#task-05-acceptance-record).
The clean-install quality gate passes **319 tests / 14 files**: **94 event
integration tests**, **165 existing backend tests**, and **60 frontend tests**,
plus lint, strict types, and both production builds.

Task 06 connects the organizer workspace to those APIs: validated create/edit
forms, real list/detail views, confirmed publication/cancellation, and live
dashboard links. The backend implementation is unchanged. See
[organizer frontend behavior](docs/events.md#organizer-frontend-task-06) and the
[Task 06 acceptance record](docs/implementation-plan.md#task-06-acceptance-record).
Its clean-install quality gate passes **395 tests / 20 files**: **136 frontend
tests** (76 added in Task 06) and **259 unchanged backend tests**, plus lint,
strict TypeScript, and both production builds. Real-browser verification covers
paid/free creation, editing, publication/cancellation, refresh persistence,
filters/pagination, role/ownership protection, and desktop/tablet/mobile layouts.

Task 07 adds public `/api/events` list/detail APIs and `/events` marketplace/detail
pages. Published upcoming events are searchable by title/venue with price/date
filters, deterministic sorting, bounded server pagination, and shareable URLs.
Draft/cancelled/past events stay hidden; registration-closed and sold-out upcoming
events remain visible with accurate labels. See [discovery contracts](docs/discovery.md).
The clean-install gate passes **512 tests / 24 files**: **199 frontend** and
**313 backend**, including **63 new frontend** and **54 new backend** tests,
plus lint, strict types, and both builds. Real browser checks verify the organizer
publication-to-discovery lifecycle, cancellation exclusion/history, anonymous and
attendee access, queries/pagination, and responsive layouts. Compiled-server checks
also verify public access without JWT configuration and safe database failures.

Task 08 adds reservation orchestration, atomic inventory and expiring holds.
Simulated checkout, QR generation, check-in, and analytics remain upcoming.
Displayed public capacity never guarantees allocation.
[AGENTS.md](AGENTS.md) records the permanent stack and
engineering rules for future sessions.

The [mid-project rubric audit](docs/rubric-audit.md) verifies Tasks 01–07 separately
from final-project completeness. It corrects HTTP/log error boundaries, production
binding defaults, live publication deadlines, and test worker contention. The final
audit gate passes **522 tests** (201 frontend, 321 backend), lint, strict types, and
both builds. Its verdict is **READY WITH DOCUMENTED NONBLOCKING RISKS** for Task 08;
hosted evaluator access and the remaining business workflows are still required.

## License

[MIT](LICENSE). Copyright 2026 KaizokuHam.

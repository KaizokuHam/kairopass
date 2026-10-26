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

## Planned workflows

1. Organizer event creation and management.
2. Event discovery and ticket reservations.
3. Database-backed simulated payment processing and confirmation.
4. Signed QR ticket issuance and secure check-in.
5. Organizer analytics and reporting.

Payments will be simulated. No real card processing or real payment collection
is planned. Event/booking/payment/ticket workflows remain upcoming after Task 03.

## Stack and architecture

- React, Vite, TypeScript, Tailwind CSS, React Router, shadcn/ui-compatible structure.
- Node.js 24, Express 5, TypeScript, Zod.
- MongoDB replica set / MongoDB Atlas, Mongoose 9, explicit indexes and transaction-ready infrastructure.
- Argon2id passwords, HTTP-only JWT cookies, MongoDB-backed sessions, and persisted-role authorization.
- Vitest, Supertest, ESLint, npm workspaces, GitHub Actions.

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
Authentication endpoints require database readiness and valid JWT configuration.
Frontend authentication pages arrive in Task 04.

| Command | Purpose |
| --- | --- |
| `npm install` | Install after intentionally changing dependency manifests |
| `npm ci` | Reproduce the committed lockfile across both workspaces |
| `npm run dev` | Start Vite and Express together; stop both with Ctrl+C |
| `npm run dev -w client` | Start the frontend independently |
| `npm run dev -w server` | Start the backend independently |
| `npm run lint` | Lint the repository, rejecting warnings |
| `npm run typecheck` | Type-check both workspaces |
| `npm test` | Run all HTTP, configuration, and real MongoDB integration tests |
| `npm run test:unit` | Run HTTP/configuration/disconnected guard tests without MongoDB |
| `npm run test:db` | Start an owned disposable MongoDB replica set and run database tests |
| `npm run test:auth` | Run authentication unit and real HTTP integration tests |
| `npm run test:watch` | Run backend tests in watch mode |
| `npm run build` | Compile client and server |
| `npm run check` | Run lint, type checks, tests, and builds |
| `npm start` | Start the compiled Express server |

## Environment

Copy the documented [`.env.example`](.env.example) into the repository root.
`PORT`, `HOST`, `NODE_ENV`, `CLIENT_ORIGIN`, `API_PROXY_TARGET`, and `LOG_LEVEL`
configure the foundation. If you change `PORT`, also update `API_PROXY_TARGET`
and any explicit `APP_ORIGIN`.
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
│   │   ├── pages/              # Overview, vision, and 404 views
│   │   ├── layouts/            # Navigation, main content, footer
│   │   ├── hooks/              # API health lifecycle
│   │   ├── services/           # Relative-path HTTP client
│   │   ├── context/            # Reserved for future app state
│   │   ├── lib/                # Styling utilities
│   │   ├── types/              # Client API contracts
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── components.json         # shadcn/ui conventions and aliases
├── server/
│   ├── src/
│   │   ├── modules/auth/       # Routes, controllers, services, validation, JWT/password utilities
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

## Implementation status

Tasks 01–02 establish the application and MongoDB foundation. Task 03 adds the
four authentication endpoints, Argon2id passwords, revocable JWT sessions,
authorization middleware, rate limiting, and CSRF defenses. Authentication-specific
verification passes **90 tests**, including **68 real HTTP integration tests**
against an owned replica set. The full quality gate passes **165 tests / 6 files**,
lint, strict types, and both builds after a clean install. Compiled-server smoke
checks verify registration/login/me/logout, copied-token rejection, independent
sessions, CSRF, cookie flags, and safe failures with invalid JWT configuration or
unavailable MongoDB. The unit-only command separately passes **57 tests**.

The frontend, health contract, existing business models, proxy, and single-origin
serving remain intact. See [CI runs](https://github.com/KaizokuHam/kairopass/actions/workflows/ci.yml)
for remote verification and [database architecture](docs/database.md) for data-integrity limits.

Authentication frontend, event management/discovery, reservation orchestration,
simulated checkout, QR generation, check-in, and analytics remain upcoming work.
Task 04 is Authentication Frontend, Protected Routing & User Experience.
[AGENTS.md](AGENTS.md) records the permanent stack and
engineering rules for future sessions.

## License

[MIT](LICENSE). Copyright 2026 KaizokuHam.

# KairoPass

A full-stack event booking platform with simulated payments, secure QR ticketing,
and organizer analytics. Built as a modular monolith for an academic software
engineering evaluation.

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
is planned. These product workflows are not implemented in Task 01.

## Stack and architecture

- React, Vite, TypeScript, Tailwind CSS, React Router, shadcn/ui-compatible structure.
- Node.js 24, Express 5, TypeScript, Zod.
- PostgreSQL and Prisma 7 (schema and database connection begin in Task 02).
- Planned authentication: JWT in secure HTTP-only cookies, with role authorization.
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
<http://127.0.0.1:4000>. Task 01 requires no running PostgreSQL instance or secrets.
Environment defaults work even without `.env`.

| Command | Purpose |
| --- | --- |
| `npm install` | Install after intentionally changing dependency manifests |
| `npm ci` | Reproduce the committed lockfile across both workspaces |
| `npm run dev` | Start Vite and Express together; stop both with Ctrl+C |
| `npm run dev -w client` | Start the frontend independently |
| `npm run dev -w server` | Start the backend independently |
| `npm run lint` | Lint the repository, rejecting warnings |
| `npm run typecheck` | Type-check both workspaces |
| `npm test` | Run backend HTTP and configuration tests |
| `npm run test:watch` | Run backend tests in watch mode |
| `npm run build` | Compile client and server |
| `npm run check` | Run lint, type checks, tests, and builds |
| `npm start` | Start the compiled Express server |

## Environment

Copy the documented [`.env.example`](.env.example) into the repository root.
`PORT`, `HOST`, `NODE_ENV`, `CLIENT_ORIGIN`, `API_PROXY_TARGET`, and `LOG_LEVEL`
configure the foundation. If you change `PORT`, also update `API_PROXY_TARGET`.
Database and cookie/JWT entries are reserved for later tasks and contain only
placeholders. Never put secrets in `VITE_*` variables: Vite exposes those to the
browser. Environment files, dependencies, and build output are ignored by Git.

For a production preview, first run `npm run build`, set `NODE_ENV=production`
in your environment, then run `npm start`. For example, in PowerShell:

```powershell
$env:NODE_ENV = 'production'
npm start
```

Open <http://127.0.0.1:4000>. Restore development mode afterward with
`Remove-Item Env:NODE_ENV`. No deployment credentials are required for local use.

## Implementation status

Task 01 is in progress. The workspace and tooling are being established;
verification results will be recorded before the task is marked complete.
Authentication, database models, events, bookings, payments, tickets, check-in,
and analytics are upcoming work. See the roadmap for milestone boundaries.

## License

[MIT](LICENSE). Copyright 2026 KaizokuHam.

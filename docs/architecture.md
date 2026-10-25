# KairoPass architecture

## Modular monolith

One Node.js process owns the API and serves the compiled React application in
production. One PostgreSQL database will hold durable state. This keeps local
setup, transactions, deployment, and evaluation understandable without a
microservice infrastructure. The browser never connects directly to PostgreSQL.

```text
Development: browser -> Vite :5173 -> /api proxy -> Express :4000
Production:  browser -> Express -> /api routes -> module services -> Prisma -> PostgreSQL
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
- `server/src/config`: validated environment configuration.
- `server/src/middleware`: cross-cutting request logging, errors, and API fallbacks.
- `server/src/modules`: domain modules, introduced only in their assigned tasks.
- `server/src/lib`: infrastructure utilities; future shared Prisma instance.
- `server/prisma`: future schema, migrations, and seed data.

Future modules: identity, events, reservations, payments, tickets/check-in, and
analytics. Each module will own its router, Zod request validation, service rules,
and persistence operations. Routes should translate HTTP; services should enforce
business invariants. Modules will call explicit service contracts instead of
reaching into each other's controllers. No speculative abstractions or business
endpoints are needed in Task 01.

## Deployment and API

All browser API requests use `/api`. A Vite development proxy avoids cross-origin
cookie complexity. Optional local CORS allows only the configured client origin;
production uses the same origin and does not enable CORS by default.

API handlers and their JSON 404 fallback must run before static assets and the
SPA fallback. A missing API route must never return `index.html`. Browser GET
routes may receive the React entry point; missing files must remain 404s.
Production requires a prior frontend build. The health endpoint is liveness only,
not database readiness, and must work without a database.

The error contract is `{ success: false, error: { code, message, requestId } }`.
Unexpected errors must not expose stack traces or internal messages to clients.
Every response gets a generated request ID. Request logs include method, path
without query values, status, duration, and request ID; no request bodies,
authorization headers, or cookies are logged.

## Persistence and security planned for later tasks

PostgreSQL transactions will enforce booking capacity and payment/ticket state.
The schema and constraints will be designed in Task 02, not guessed here.
Prisma 7 is pinned to a stable release; no client is instantiated at startup.

Authentication will use signed JWTs in secure HTTP-only cookies, server-side
authorization, organizer ownership checks, and an explicit CSRF strategy before
cookie-authenticated mutations are introduced. QR tickets will require signed
payloads and replay-safe, atomic check-in. Simulated payments will use durable
state transitions and idempotency; they will never collect real card data.

Configuration comes from the root `.env` or process environment; process values
take precedence. Database and authentication variables are documented but are
not required or consumed in Task 01. Secrets must never enter client bundles.

## Quality gates

Strict TypeScript, linting, Vitest/Supertest, and a production build are the local
and CI gates. HTTP integration tests should cover the middleware contract and
API/static route separation as well as the health response. Browser smoke checks
will verify real connectivity through Vite and the production single origin.

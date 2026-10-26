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
- Task 04 must use relative API requests and restore state through `/api/auth/me`.
  Do not store tokens in localStorage/sessionStorage or invent authenticated success states.

## Verification and Git

- Use `npm ci` and `npm run check` (lint, types, all tests, both builds).
- `npm run test:unit` needs no MongoDB process; `npm run test:db` owns its replica set.
- `npm run test:auth` runs authentication unit and real HTTP/replica-set tests with ephemeral keys.
- Keep changes small and coherent; use conventional commits and the configured authorized Git identity.
- Preserve existing work. Never fabricate/backdate commits, rewrite published history, or force-push.
- Avoid unnecessary repository restructuring. Never commit secrets, binaries, dependencies, or build output.
- Verify before publishing. Push successful completed work to GitHub and verify the remote head/CI.
- Report actual commit hashes, observed test results, and remaining blockers honestly.

## Remaining roadmap

- 03 — Authentication Backend (implemented; see verification record)
- 04 — Authentication Frontend
- 05 — Event Management Backend
- 06 — Event Management Frontend
- 07 — Event Discovery
- 08 — Reservation Engine
- 09 — Simulated Payment Gateway
- 10 — QR Ticketing
- 11 — Ticket Check-In
- 12 — Organizer Analytics
- 13 — Integration Testing & Hardening
- 14 — Production Release & Documentation

Future tasks must continue using MongoDB/Mongoose. Implement only the task the
user authorizes. Authentication frontend belongs to Task 04; booking/payment/
ticket workflows remain later tasks and require their own authorization.

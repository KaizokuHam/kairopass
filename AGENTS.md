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

## Verification and Git

- Use `npm ci` and `npm run check` (lint, types, all tests, both builds).
- `npm run test:unit` needs no MongoDB process; `npm run test:db` owns its replica set.
- Keep changes small and coherent; use conventional commits and the configured authorized Git identity.
- Preserve existing work. Never fabricate/backdate commits, rewrite published history, or force-push.
- Avoid unnecessary repository restructuring. Never commit secrets, binaries, dependencies, or build output.
- Verify before publishing. Push successful completed work to GitHub and verify the remote head/CI.
- Report actual commit hashes, observed test results, and remaining blockers honestly.

## Remaining roadmap

- 03 — Authentication Backend
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
user authorizes; Task 02 does not authorize authentication or booking workflows.

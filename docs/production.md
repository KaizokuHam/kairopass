# KairoPass — Production Guide

**Demo video:** [Watch the KairoPass Demo](https://drive.google.com/file/d/1pH1etl-LntFd83MKz_23EYMFIff7FNq7/view?usp=sharing)

**Live application:** [kairopass-vaibhav.onrender.com](https://kairopass-vaibhav.onrender.com)
 · **Source:** [KaizokuHam/kairopass](https://github.com/KaizokuHam/kairopass)

KairoPass is a full-stack event booking and ticketing platform for attendees and
organizers. Payments are simulated; **no real money is collected**. React assets
and the Express API run together on Render with one public HTTPS origin.
MongoDB Atlas persists users, sessions, events, reservations, payment attempts and tickets.

## Architecture and operating contracts

The application is a MERN modular monolith with thin controllers, Zod input
boundaries, service-owned business rules, explicit DTOs and one Mongoose lifecycle.
The browser uses relative `/api` requests. Express handles API routes before
static assets and the SPA fallback. A missing asset or API route must not return
the application's index page.

Detailed contracts are retained in [architecture](architecture.md),
[database](database.md), [authentication](authentication.md), [events](events.md),
[discovery](discovery.md), [reservations](reservations.md), [payments](payments.md),
[tickets](ticketing.md), [admission](checkin.md) and [analytics](analytics.md).

The principal integrity rules are:

- Allocate or release an Event unit in the same transaction as its Reservation
  transition. Occupied inventory equals HELD plus CONFIRMED, including elapsed
  holds until authoritative expiry runs. Never clamp or casually repair counters.
- Holds last ten minutes from server creation and preserve their price snapshot.
  Confirmation retains the same unit, original amount and deadline. Free events
  require explicit zero-value simulated checkout.
- Persist payment intent before finalization. Same-key replay resumes the original
  immutable request; a deliberate retry after failure gets a new UUID key.
- Issue one signed ticket only after durable confirmation/payment evidence.
  Persist backend-generated identity and nonce; never generate a replacement on GET.
- A valid QR signature alone cannot admit a person. Check persisted eligibility,
  organizer ownership and the admission window, then conditionally win ISSUED → USED.
  Replay must retain the original admission time and deny another approval.
- Reports are organizer-owned read-only snapshots. Reduce payment retries before
  joining totals and preserve exact integer paise through Decimal128/string/BigInt.
  Reporting never expires holds or modifies business records.

## Runtime and build

Use Node **24.14+ below 25** and npm **11+**. The repository pins Node 24.14.0.
Run from the workspace root:

```sh
npm ci --include=dev
npm run build
npm start
```

The build emits `client/dist` and `server/dist/server.js`. Production starts the
compiled Express application; Vite and tsx are development tools. Render must
bind `HOST=0.0.0.0` and use its supplied `PORT`. Keep the root directory at the
repository root and `/api/ready` as the HTTP readiness path.

The retained [render.yaml](../render.yaml) is the infrastructure configuration.
Review the existing service before applying changes; do not create a duplicate
service or replace a working deployment merely to reproduce this guide.

## Environment

| Name | Production requirement |
| --- | --- |
| `NODE_ENV` | production |
| `HOST`, `PORT` | 0.0.0.0 and the provider-supplied port |
| `MONGODB_URI` | Managed TLS Atlas URI with an explicit application database |
| `APP_ORIGIN` | Exact actual HTTPS origin without path/trailing slash |
| `CLIENT_ORIGIN` | Same public HTTPS origin |
| `JWT_SECRET` | Strong canonical unpadded base64url signing key |
| `TICKET_HMAC_SECRET` | Independently generated strong canonical base64url key |
| `JWT_EXPIRES_IN` | Session lifetime; default 12h |
| `JWT_ISSUER`, `JWT_AUDIENCE` | Consistent verification identifiers |
| `LOG_LEVEL` | info or silent |

Use [`.env.example`](../.env.example) for local setup. Production credentials
belong in managed environment fields, never source, screenshots, logs or `VITE_*`.
Generate the JWT and ticket keys independently with `crypto.randomBytes(48)`
encoded as base64url. Padded base64 values from Render's `generateValue` do not
meet the application's canonical key validation.

Preserve both keys across deploys, restart and rollback. JWT rotation invalidates
sessions; ticket-key rotation invalidates old exported QR signatures. There is
no ticket key ring or rotation grace period. Never rotate keys during documentation cleanup.

## Atlas and readiness

MongoDB must be a replica set or supported sharded deployment. Use a dedicated
database user scoped to the application database, with collection/index startup
and transactional runtime privileges. Keep TLS validation enabled. Restrict
network access to verified service egress ranges; do not silently enable an
allow-all rule or change an existing application's credentials/access.

Startup verifies topology and additive indexes before readiness. Do not drop or
synchronize live indexes automatically. Preserve unique normalized email, active
reservation, payment and ticket constraints. Reservation and Ticket TTL deletion
are prohibited; AuthSession TTL is permitted and is not the authorization clock.

- `/api/health` is database-independent liveness.
- `/api/ready` requires initialized topology/indexes and a bounded database ping.
- Readiness does not certify signing secrets; verify auth and ticket configuration separately.
- Initial database failure keeps readiness unavailable. Correct configuration and
  restart; there is no application-level infinite connection retry loop.
- After an established connection is lost, guards fail closed while the driver
  attempts reconnection. Infrastructure uncertainty must not become fabricated
  payment failure, admission approval or empty reporting success.

Never run disposable test cleanup, database reset or destructive fixtures against
Atlas. Backups require an access-controlled encrypted destination and a restore
rehearsal in a separately owned namespace. Confirm backup support on the actual
Atlas tier before promising managed continuous backup.

## Authentication and browser security

Production cookies are host-only, HttpOnly, Secure, SameSite=Lax and Path=/.
Unsafe requests require the exact configured trusted Origin, including login and
registration. Do not weaken cookie flags, TLS, CSP or Origin checks to repair a
configuration error. JWTs contain no roles; authorization uses current persisted
users, live revocable sessions and explicit resource ownership.

Proxy trust remains false unless a provider-specific ingress/header policy is
verified. Authentication limits may consequently share proxy buckets. Default
registration/login limits are 5/10 per 15 minutes per process. Other mutation
limits are likewise process-local; multi-instance deployments require a deliberate
shared policy. Never blindly trust all forwarding headers or an arbitrary hop count.

## Expiry, availability and shutdown

The bounded minute expiry worker starts only after database initialization.
Its conditional transactions release each elapsed hold once. Free hosting can
sleep after inactivity and delay cleanup; this is not an always-on expiry SLA.
Lazy reconciliation and authoritative reads remain subject to database availability.
Keep confirmed inventory occupied and retain terminal history.

SIGTERM/SIGINT stops the worker, drains HTTP and closes the database. The process
uses a ten-second shutdown budget. Provider shutdown allowance must exceed it.
Restart against the same database and signing keys, then verify retained history,
ticket identity, sessions/revocation and readiness.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
# Combined quality gate:
npm run check
```

The recorded complete gate passes **1,062 tests / 42 files**: 394 frontend and
668 backend. Database tests own disposable real MongoDB replica sets, ignore the
application URI, preserve original deadlines and never clean shared data.
See [GitHub Actions](https://github.com/KaizokuHam/kairopass/actions/workflows/ci.yml)
for the actual result corresponding to the source revision being evaluated.

Final submission checks on **2026-10-27** observed HTTP 200 from the public home,
health and readiness endpoints and from an anonymous Drive video-viewer request.
The Drive viewer also states that anyone with the link can access without sign-in.
Full video playback and the complete hosted business journey were not rerun during
the documentation cleanup. A successful readiness ping is not proof of every workflow.

## Evaluator walkthrough

1. Register an organizer account and create an event with a future start, open
   registration deadline, capacity and a simulated price. Publish through the
   confirmation dialog. Published schedule, capacity and price are frozen.
2. Browse Explore Events as a guest. Register an attendee, open the event and
   reserve one ticket. Observe the actual amount and ten-minute hold deadline.
3. Choose simulated failure, review retained history, then explicitly retry with
   a new successful attempt before expiry. No financial credentials are required.
4. Generate the ticket, download its PNG and refresh the wallet. Use a separate
   free event to demonstrate explicit zero-value checkout and issuance.
5. As the owning organizer, open Check-in. Admission is available from two hours
   before start until event end. Scan the ticket or paste its complete privately
   decoded signed credential; a ticket reference alone is insufficient.
6. Verify one approval and an Already Used response with the original time on
   replay. A refreshed attendee wallet must show USED without an active QR/download.
7. Review Analytics using the correct event and period filters. One ₹249.50 paid
   booking plus one free booking contributes two successful simulations and
   ₹249.50 simulated gross revenue. With exactly those two confirmations and one
   admission, cumulative attendance is 50%. Earlier retained activity changes totals.
8. Log out and verify protected resources require a valid session. Keep passwords,
   cookies, connection strings and full QR credentials out of recordings and URLs.

For a short demo, cover the product introduction, organizer publication, guest
discovery, attendee failure/retry, ticket export, admission/replay and analytics.
Use the recorded video linked above for submission; no large MP4 belongs in Git.

## Monitoring and recovery

Use request IDs and fixed safe error codes to correlate failures. Access logs
must retain route templates rather than raw credential-bearing URLs. Never enable
body/cookie/environment logging or dump driver exceptions. Investigate invariant
errors through a separately reviewed procedure; do not automatically repair counters.

Rollback to a compatible CI-successful source revision while preserving the same
database, Origins and signing keys. Recheck readiness and owned business history.
No reset, schema deletion or credential rotation is part of rollback.

## Known limits

Payments are simulated. Organizer self-registration is an academic application
policy. Free service sleep/quota, process-local limits and host resources constrain
availability; local timing measurements are not production capacity guarantees.
Static QRs can be copied: first valid admission wins, without proving the
presenter's identity. Camera support depends on the actual HTTPS browser/device;
manual entry is available. Refunds, transfers, confirmed-booking cancellation and
revocation creation are not implemented. Publishing source and a video does not
constitute submitting an academic form; retain the portal's actual confirmation.

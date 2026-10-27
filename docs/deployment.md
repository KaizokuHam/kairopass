# Production deployment runbook

Live application: [KairoPass on Render](https://kairopass-vaibhav.onrender.com).
On **2026-10-27**, anonymous home, health and database-readiness requests returned
HTTP 200. This runbook retains setup and recovery instructions; its account-setup
observations describe the earlier preparation checkpoint. See
[production verification](production-verification.md) for the evidence boundary.
Task 13 baseline: `c81629f1c808ab5847f57b9ac2549c804727738c`,
[passing CI](https://github.com/KaizokuHam/kairopass/actions/runs/40522838785).

## Deployment topology and cost boundary

Use one **Render Node Web Service** serving the compiled React application and
Express API. Durable state belongs to MongoDB Atlas through Mongoose. The minute
expiry worker runs inside that same Node process. No static-only deployment,
extra worker, local database file, D1 or database replacement is required.

The root [render.yaml](../render.yaml) explicitly selects the **Free** plan and
Singapore region. Region should be close to the actual Atlas region; changing
an existing service's region can require replacement. No paid plan, card or
upgrade has been authorized. Review the account's existing billing settings and
remaining quotas before creation. Do not accept paid resources or overages as
an implicit consequence of this guide.

Render documents a 15-minute idle spin-down, cold starts, 750 shared free instance
hours per workspace/month, and build/bandwidth limits. Quota exhaustion can
suspend service or builds; accounts with a payment method can incur overages.
Confirm current account limits in Billing. Sleeping instances cannot execute the
minute worker. Elapsed holds retain inventory until the process wakes and the
existing worker/lazy reconciliation runs; transactions still release each unit
once. This is a demo-hosting limitation, not an always-on expiry SLA.

Sources checked 2026-10-27: [Node versions](https://render.com/docs/node-version),
[Blueprint specification](https://render.com/docs/blueprint-spec),
[Free service limits](https://render.com/docs/free),
[health checks](https://render.com/docs/health-checks),
[outbound IPs](https://render.com/docs/outbound-ip-addresses),
[deploys and CI](https://render.com/docs/deploys).
Render's status page reported all systems operational during preparation;
check [current status](https://status.render.com/) at deployment time.

## Build and start configuration

| Setting | Value |
| --- | --- |
| Repository / branch | `KaizokuHam/kairopass` / `main` |
| Root directory | Repository root; leave blank in the dashboard |
| Service type / runtime | Web Service / Node |
| Node | `NODE_VERSION=24.14.0`, matching `.nvmrc` |
| npm | 11+; lockfile was verified with 11.9.0; inspect the hosted build log |
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm start` |
| HTTP readiness path | `/api/ready` |
| Bind / port | `HOST=0.0.0.0`; use Render's supplied `PORT` |
| Shutdown allowance | 30 seconds; application has a 10-second drain deadline |
| Automatic deploy | After CI Checks Pass, when GitHub is connected |

`--include=dev` preserves TypeScript/Vite build dependencies despite production
NODE_ENV. The build must create `client/dist/index.html`, its assets, and
`server/dist/server.js`. Start executes compiled Node, never Vite, tsx or a
development server. The frontend always requests relative `/api` URLs.

Express routes `/api` before SPA fallback. Unknown API and asset requests return
JSON 404; extensionless browser routes return the compiled index for refresh.
No separate frontend URL or permissive cross-origin configuration is needed.
Do not upload the local `.env` or copy its loopback HOST into production.

## Atlas preparation

1. Sign in to the student's Atlas project. Use an existing compatible cluster or
   an explicitly selected no-cost tier. Do not upgrade or attach billing without
   approval. Verify a replica set or compatible sharded cluster; standalone MongoDB
   cannot support this application's transactions.
2. Select an explicit application database, normally `kairopass`. Create a
   dedicated database user scoped to this database. Database-scoped `readWrite`
   is the starting role: startup needs collection/index creation and inspection,
   and runtime needs reads, writes and transactions. Verify actual privileges
   against the startup checks; do not grant atlasAdmin/readWriteAnyDatabase as a
   shortcut. The Atlas account login and database user are different identities.
3. Obtain the driver URI in Atlas Connect → Drivers. Add `/kairopass` before `?`
   if the generated URI has no database path. Percent-encode credentials and keep
   Atlas-provided TLS settings. Never enable invalid-certificate or invalid-host
   allowances. Never commit or photograph the populated URI.
4. After the Render service exists, open its **Connect → Outbound** tab. Add all
   displayed regional CIDR ranges to Atlas's network access list. They are shared
   regional egress ranges, not unique addresses for this application. Do not
   confuse them with inbound DNS addresses or guess ranges from an example.
5. Add a temporary developer IP only when local diagnosis is needed; remove that
   temporary entry afterward. **Do not silently enable `0.0.0.0/0`.** An unrestricted
   rule needs an explicit security decision and is not the default deployment path.
6. Save the URI only as Render's managed `MONGODB_URI`. Follow
   [database.md](database.md#mongodb-atlas-production-configuration).

Startup uses one connection, disables buffering, checks `hello`, creates/verifies
required additive indexes, and only then permits readiness. Unique-email,
active-reservation, payment-key/transaction and ticket-reservation/nonce indexes
must remain intact. No sync/drop index action is part of deployment. Reservation
and Ticket TTL indexes are prohibited; AuthSession expiry TTL is intentional.

An Atlas ping proves reachability only. To verify production transactions, use
the limited application workflows below with dedicated demo records and retain
them. **Never run test cleanup, dropDatabase, seed-reset or a disposable-test suite
against Atlas.** Automated database tests own separate loopback replica sets.

## Environment and secrets

Set these on the service's Environment page. `sync: false` entries in a Blueprint
are supplied during initial creation; later additions/changes must be made on the
service. Render does not interpolate arbitrary variables inside Blueprint values.

| Name | Required production setting |
| --- | --- |
| `NODE_VERSION` | 24.14.0 |
| `NODE_ENV` | production |
| `HOST` | 0.0.0.0 |
| `PORT` | Provider-supplied; do not force local 4000 |
| `MONGODB_URI` | Managed secret, actual Atlas URI with explicit application database |
| `APP_ORIGIN` | Actual assigned HTTPS origin, no path or trailing slash |
| `CLIENT_ORIGIN` | Same actual HTTPS origin |
| `JWT_SECRET` | Independently generated canonical unpadded base64url, at least 32 random bytes |
| `TICKET_HMAC_SECRET` | Separately generated canonical unpadded base64url; never equal to JWT key |
| `JWT_EXPIRES_IN` | 12h |
| `JWT_ISSUER` | kairopass-api |
| `JWT_AUDIENCE` | kairopass-web |
| `LOG_LEVEL` | info |

`API_PROXY_TARGET` is development-only. No `VITE_*` secret belongs in hosting.
Generate each key separately on a trusted local terminal:

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Run twice and transfer directly to the managed fields; do not paste values into
chat, repository files, screenshots or deployment logs. Render's Blueprint
`generateValue` produces padded base64, so it is intentionally not used: that
format fails this application's canonical base64url validation. Preserve both
keys across deploys, restarts and rollback. JWT rotation invalidates sessions;
ticket-key rotation invalidates previously exported QR signatures. No key ring
exists. Treat a necessary rotation as an explicit operational change.

## Dashboard deployment sequence

1. Authorize/sign in to Render. Review any new GitHub access request at the action
   itself; restrict repository installation to `KaizokuHam/kairopass` when offered.
   Account creation/terms, billing, credential creation and new security grants
   may require the account owner's action. No account access is assumed.
2. Choose **New → Web Service**, connect the repository and select `main`. A
   Blueprint import using `render.yaml` is an alternative. Do not select Static Site.
3. Apply the build/start/runtime/readiness settings above and explicitly select
   Free. Keep a single instance. Inspect the settings before creating anything.
4. Supply managed secrets and exact actual Origins. If the service's assigned URL
   becomes available only after creation, make the first deployment private to
   verification: do not invite users or attempt auth until both Origins have been
   set to that URL and a subsequent deployment completes. Never guess a live URL
   or leave a placeholder Origin as a claimed successful release.
5. Obtain Outbound CIDRs, authorize the restricted Atlas network entries, and
   redeploy after saving actual database configuration. Wait for **Live** and
   `/api/ready` 200, not merely a completed build or liveness 200.
6. Check the deployed Git SHA against `git rev-parse origin/main` and its successful
   GitHub Actions run. For public-Git-URL services without a connected Git provider,
   automatic deploys are unavailable: manually deploy only a CI-successful SHA.
   Render can accept neutral/skipped checks; the release record requires an actual
   successful complete workflow, not a skipped job.
7. Open the public HTTPS URL in a browser and perform all acceptance steps below.
   Record timestamp, SHA and observed results in production-verification.md before
   publishing a live-link claim or declaring Task 14 complete.

The screens verified during preparation were Render's sign-in/GitHub authorization,
Railway's sign-in and Atlas's sign-in. No service creation, account authorization,
Atlas allowlist modification or public deployment is claimed by this runbook.

## HTTPS, cookies, proxy policy and limits

Render terminates public TLS. Require a trusted certificate and HTTP-to-HTTPS
redirect; never bypass certificate warnings. Production sets a host-only
`kairopass_session` cookie with Secure, HttpOnly, SameSite=Lax and Path=/.
Verify registration, `/me`, page refresh, login and logout in the actual HTTPS
browser. A local HTTP smoke with a manually forwarded cookie cannot establish this.

Unsafe requests require exact configured APP_ORIGIN, including login/register.
Do not derive trust from Host/X-Forwarded headers, add wildcard Origins, loosen
SameSite or disable Secure to repair configuration mistakes. Private responses
and errors are no-store. Verify CSP, nosniff, frame denial, no-referrer and HSTS;
local QR data/blob images and same-origin camera media remain permitted.

**Current policy: `trust proxy = false`.** Cookies use explicit production flags
and do not depend on proxy trust. Per-IP registration/login limits can group users
by the platform proxy address (defaults 5/10 per 15 minutes per process). This is
a conservative documented demo limitation, not verified per-user proxy behavior.
Do not set trust proxy=true or trust an arbitrary hop count. Before changing it,
verify actual trusted ingress ranges/hops and header overwrite behavior, test
forged forwarding headers, and keep exact Origin independent. Express explains
the trust boundary in its [proxy guide](https://expressjs.com/en/guide/behind-proxies/).
Scaling beyond one process needs a deliberate shared limiter policy. Transactional
expiry is multi-instance safe, but process-local rate limits are not distributed.

## Startup, recovery and shutdown

- `/api/health`: database-independent liveness; not a release-readiness assertion.
- `/api/ready`: initialized transactional topology/indexes plus bounded database
  ping. It does not validate signing keys; separately test auth and ticket issuance.
- An initial database connection failure leaves the process live, readiness 503,
  and the expiry worker stopped. There is no app-level infinite retry loop. Correct
  credentials/network/configuration, then restart/redeploy. Render's readiness
  health gate withholds a failing new instance; sustained running-instance failures
  are documented to trigger platform restart. Confirm that behavior on the actual
  chosen plan; a failed new deployment does not become healthy by assumption.
- After an established connection is lost, readiness/guards fail closed and driver
  reconnection may recover it. Do not report a failed DB operation as payment
  failure or admission rejection; preserve existing uncertainty recovery paths.
- The worker starts explicitly after initialization, scans bounded due holds each
  minute, and stops/drains with HTTP on SIGTERM/SIGINT. The application allows ten
  seconds before forced exit; Render's configured 30-second allowance exceeds it.
- Restart with the same Atlas database and keys. Check retained events, booking
  and payment history, ticket identity and session/revocation behavior afterward.
  GET must never issue a ticket or replace its nonce.

## Public acceptance checklist

Use a unique demo prefix and accounts owned for this release. Preserve production
demo records; do not seed fake metrics or erase failed attempts afterward.

1. Check HTTPS home, actual JS/CSS, navigation, `/events`, login/register and deep
   route refresh. Check health/readiness 200, unknown `/api` JSON 404 and missing
   asset 404. Inspect console for mixed content/CSP/CORS errors.
2. Register organizer and attendee; refresh sessions; verify live roles and logout.
   Verify a revoked copied session only through a credential-safe owned test client;
   never print it. Check guest/wrong-role/unowned resources fail safely.
3. Publish a paid event (for example ₹249.50) and a free event, capacity 10. Use
   start +60–90 minutes, end +3 hours, registration deadline +45 minutes. This keeps
   discovery/booking open and admission within its two-hour window. Record actual
   absolute times and browser timezone; never edit live dates through raw DB writes.
4. Find the paid event as a guest, then reserve as an attendee. Choose simulated
   failure, verify HELD/history, then explicitly retry with a new key and succeed.
   Same-key replay must not duplicate confirmation or simulated revenue.
5. Generate the actual ticket, export/read the PNG, refresh the wallet/detail and
   confirm stable identity. Keep credentials local/in memory; do not commit images
   containing a live QR or put credentials in URLs, logs or submission text.
6. As owning organizer, manually enter the same full credential at Check-in.
   First admission approves once; replay returns Already Used with the original
   time. Invalid credentials and another organizer's event must not approve.
   Refresh attendee wallet: Already Used, no active QR/download.
7. Explicitly confirm the free hold, issue its ticket and verify zero-value success
   increases booking/payment counts but adds zero simulated revenue. At this point
   the paid+free cohort should have two confirmed bookings and two successful
   simulated payments; one failed attempt and one paid admission produce ₹249.50
   simulated gross revenue and 50% attendance, if no other demo activity exists.
   Filter to these events and read actual persisted results rather than forcing
   expected numbers into the UI. Analytics is read-only.
8. Leave a separate hold unconfirmed for its full ten minutes. Observe expiry via
   the hosted worker and authoritative history; capacity releases once, confirmed
   reservations remain occupied. Repeat reads do not release it twice. Measure
   sleep/cold-start delay separately; do not change a production expiresAt to speed it up.
9. Check widths 1440/768/390, keyboard controls/dialogs and manual entry. Physical
   phone camera verification is a separate result requiring HTTPS/device access.
10. Make a small number of non-destructive public/report reads and inspect sanitized
    logs. Record actual hosted timings without claiming a load guarantee. Keep
    concurrent capacity/issuance/scanner stress tests on disposable local replicas.

See [demo.md](demo.md) for preparation and narration and
[production-verification.md](production-verification.md) for the results ledger.

## Monitoring, backup and rollback

Monitor readiness as well as process status. Correlate safe request IDs and fixed
error codes with Render logs. Application access logs use route templates; do not
enable request-body, cookie, raw-URL, environment or driver-exception logging.
The hosting platform's own logs are a separate surface: never send QR credentials
in URLs. Investigate inventory or payment integrity errors; no automatic repairs.

Choose Atlas backup capabilities appropriate to the actual tier. Free tiers may
not provide managed continuous backups; verify the account before promising them.
If approved, export encrypted backups to an access-controlled destination using
official MongoDB tools, record retention, and rehearse restore into a **separate
owned namespace**. No backup, restore rehearsal or production destructive test has
been performed in preparation. Do not upload unencrypted dumps to GitHub.

Rollback means selecting a previously CI-successful compatible commit in Render,
keeping the same database, exact Origins and signing keys, then rechecking readiness
and paid/free/admission history. This release introduces no schema migration or
index deletion. Do not restore an older codebase that lacks current data contracts,
rewrite Git history, drop collections or silently rotate keys during rollback.
Record the deployed SHA and pause auto-deploy if it would overwrite the rollback.

## Troubleshooting

| Symptom | Check and recovery |
| --- | --- |
| Build cannot find Vite/tsc | Root directory and `npm ci --include=dev`; Node/npm versions and lockfile |
| Port detection fails | HOST=0.0.0.0, provider PORT, compiled start command; remove copied loopback override |
| Health 200, ready 503 | Atlas SRV/DNS, TLS, credentials, explicit database, regional egress allowlist, topology/index privileges; correct then restart |
| SRV `ECONNREFUSED` | Preparation isolated system querySrv refusal; a process-local resolver connected successfully. Diagnose the host's resolver separately; do not change global DNS, dump the URI or disable TLS |
| Ready 200, auth 503 | Canonical strong JWT key and exact HTTPS APP_ORIGIN; readiness does not validate auth |
| Auth works, ticket/check-in 503 | Independent canonical TICKET_HMAC_SECRET and stable deployed keys |
| Login/register 403 | Exact Origin, no trailing slash/path, actual assigned HTTPS hostname, relative API request |
| Refresh signs out | Inspect Secure/HttpOnly/host/path flags on trusted HTTPS, `/me` status, server clock and retained session; never expose JWT |
| 429 behind proxy | Respect Retry-After; conservative shared proxy bucket is documented. Verify ingress policy before changing trust or limits |
| SPA deep route 404 | Both dist outputs deployed; Express compiled server owns routing; missing assets should still be 404 |
| Camera unavailable | Trusted HTTPS, explicit user permission, supported device/browser; use manual complete credential entry |
| Hold expired but capacity occupied | Worker sleep/backlog/database availability; read authoritative state. Do not clamp counters/delete history |
| Uncertain payment/ticket/admission | Read owned durable history; use existing explicit same-request recovery. Never blindly retry mutations or invent success |
| Wrong analytics totals | Confirm period/cohort/event filter, UTC boundaries and integrity diagnostics; do not repair source data in reports |

## Completion boundary

Only a tested public HTTPS URL with actual Atlas transactions, stable persistence,
auth, paid/free checkout, ticket export, single-use entry and correct reporting
qualifies as a verified public release. A passing build, Blueprint validation or
GitHub CI alone does not. If account/security actions remain, report
**DEPLOYMENT PREPARED — USER ACTION REQUIRED** and list them precisely.

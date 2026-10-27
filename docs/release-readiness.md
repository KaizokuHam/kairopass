# Task 13 — release readiness

## A. Executive summary

Audit date: **October 27, 2026 (IST)**. Starting source:
`5ffc39b10fd4b666c3ed4086934e7575edbab6a8`, synchronized with `origin/main`.
Tasks 01–12 are implemented in the repository. This audit covers their connected
behavior, security boundaries, integrity, accessibility and production build.
Task 14 hosting, infrastructure changes and public deployment are not performed.

Audited implementation: `65697fb75946ddab6df448127156740d55c1b85a`.
The documentation-only delivery commit follows this source. Final local acceptance
passes **1,062 tests / 42 files** (394 frontend, 668 backend), with zero failures,
skips or lint warnings; strict types and both production builds pass. The clean
install audited 477 packages with zero reported vulnerabilities.

The review found a booking-boundary defect, credential-bearing-path logging gap,
missing production browser defense headers, scanner overflow at 320 pixels, stale
public copy and cold-test resource/loading failures. Three real-MongoDB regressions
reproduced late allocation; fresh application time and database `$$NOW` predicates
close that gap. Corrections preserve authentication, inventory, payment and
admission contracts. No database
migration, counter repair, new business collection or replacement engine is added.

### Official rubric readiness (no invented academic grade)

| Area | Exact weight | Verified readiness | Remaining delivery limitation |
| --- | ---: | --- | --- |
| Problem & Product Understanding | 10% | Complete attendee/organizer journey, explicit simulated-only payments and current product copy | Final recorded demo/evaluator walkthrough |
| Core Product Implementation | 25% | Real discovery, event lifecycle, holds, paid/free checkout, QR wallet/admission and analytics | Hosted end-to-end acceptance |
| Engineering & Application Logic | 20% | Transactional capacity, replay-safe payment/tickets, atomic admission, exact read-only reporting and twelve race categories | Future eligibility-changing workflows need new coordination |
| Architecture & Technical Decisions | 15% | Modular MERN monolith, thin HTTP modules, strict DTOs, one Mongoose lifecycle, single-origin production | Provider proxy/limiter/topology decisions |
| User Experience & Reliability | 10% | Six actual browser scenarios, failure/retry/used states, keyboard access and five responsive widths | Physical camera and broader assistive-technology/device coverage |
| Code Quality & Project Structure | 10% | Strict types/lint, focused module tests, new lifecycle snapshot oracle and semantic accessibility suite | No numerical coverage percentage or universal conformance claim |
| Deployment & Documentation | 10% | Reproducible lockfile/build, readiness/liveness/shutdown, documented integrity/security and release checklist | Public HTTPS URL, verified Atlas, monitoring/backup/rollback and final demo |
| **Total** | **100%** | Evidence of implementation readiness | Deployment remains Task 14 |

## B. Workflow acceptance matrix

| Workflow | Actual evidence | Result |
| --- | --- | --- |
| Register / login / refresh / logout | Real browser forms for both roles, refreshed organizer session, logout then protected-route redirect; real HTTP session tests | Passed |
| Organizer lifecycle | Browser create, edit, publish and public discovery; HTTP draft privacy, ownership, valid/invalid edits, publication and cancellation | Passed |
| Discovery | Actual published events, paid filter, dates/venue/prices and availability; query/visibility/pagination integration suites | Passed |
| Ten-minute reservation | Browser creates HELD with authoritative countdown; real transactions test duplicate holds, capacity, cancellation, expiry and history | Passed |
| Paid checkout | Browser failed attempt retains hold; explicit new attempt confirms; HTTP same-key replay and distinct-key races | Passed |
| Free checkout | Browser explicitly confirms ₹0.00 hold; zero-value durable SUCCESS/CONFIRMED verified | Passed |
| Ticket issuance | Browser generation, wallet/detail, real PNG download and unchanged QR rendering after refresh; DB reconnect and concurrent issuance | Passed |
| Admission | Browser manually submits genuine signed credential, receives Entry Approved; same credential receives Already Checked In — Entry Denied | Passed |
| Used-ticket history | Fresh attendee login/detail shows Already Used, original time, no active QR or download | Passed |
| Analytics | Browser shows two confirmations, two successes, one failure, ₹499.00 simulated gross revenue, one admission and 50% attendance | Passed |
| Reporting read-only | Independent full Event/Reservation/PaymentAttempt/Ticket snapshots before and after browser/API reporting are identical | Passed |

`server/tests/release.integration.test.ts` joins the lifecycle through actual HTTP,
with independently queried inventory after creation, editing, publishing, holds,
duplicate hold, denied unconfirmed issuance, failed/replayed/successful payment,
blocked cancellation, issuance/replay, tamper/owner denials, admission/replay, free
confirmation, cancellation and expiry. Expiry uses the real transaction with a
controlled cutoff; it does not claim to have slept ten minutes. Existing controlled
clock and worker suites cover exact deadline boundaries and shutdown.

The browser used a separately owned MongoDB 8.2.6 replica set, ephemeral independent
keys and `.test` accounts. No live/shared records were seeded, repaired or cleaned.
Ignored screenshots and downloaded QR files are local proof, not committed data.
The browser journey preceded the final allocation-clock correction; its unchanged
HTTP contract and paid/free paths are additionally checked by the final compiled
server smoke and the three dedicated real-MongoDB boundary regressions.

## C. Security findings

- **Authentication:** Argon2id, HS256 algorithm allowlist, issuer/audience/claim
  validation, bounded expiry, random session identifier stored only as SHA-256,
  live revocation/expiry and current persisted user/role. Tests reject anonymous,
  malformed/tampered/expired/wrong-algorithm JWTs, revoked/missing/expired sessions
  and deleted accounts. Logout revokes only its current session. No credentials
  or identity are persisted in browser storage.
- **Authorization:** private routes reuse readiness, auth and role middleware.
  Organizer events/check-ins/reports and attendee reservations/payments/tickets
  additionally enforce ownership. Cross-owner resources return privacy-preserving
  404s. Client route guards do not establish server authority.
- **HTTP:** strict Zod boundaries, bounded strings/pagination, safe integer paise,
  explicit-offset dates, escaped literal search, rejection of unknown/protected/
  repeated/operator parameters, 32 KiB JSON cap, safe malformed encoding and media
  errors. Exact configured Origin is mandatory for cookie-authenticated mutations;
  development CORS is constrained, production is same-origin. Private/error output
  is no-store. Unexpected errors expose fixed messages and request identifiers.
- **Logging correction:** access logs record source-defined route templates and
  `unmatched`, never raw path parameters, queries, bodies, cookies or QRs. Three
  synthetic credential-path regressions failed before the correction and pass
  afterward; nested router templates retain useful request metadata.
- **Browser defenses:** production CSP permits self-hosted scripts/styles/API,
  local data/blob images and blob media, blocks objects/framing/base changes, and
  limits form submissions to self. No inline/eval/remote-script allowance exists.
  Frame denial, no-referrer, nosniff and a camera-self/microphone-off/geolocation-off
  Permissions Policy apply centrally, including errors. HSTS is production-only
  and makes no unverified subdomain/preload commitment. Development HMR is preserved.
  HTTPS and provider policy still require Task 14 verification.
- **QR:** separate strong server-only HMAC key, minimal canonical v1 ID/nonce,
  domain-separated HMAC-SHA256, bounded input and length-checked timing-safe
  comparison. Tests reject wrong keys, changes, noncanonical input, unsupported
  versions, wrong persisted nonce/event and replay. Authenticity never substitutes
  for live eligibility or the atomic consumption write.
- **Secret hygiene:** tracked filenames, all reachable historical blobs, current
  configured secret equality and built client assets were examined without printing
  credentials. Two URI-pattern hits are deliberately synthetic error-redaction
  fixtures, not discovered live credentials. No real configured value matched
  tracked files/history/bundles. `.env` and generated evidence remain ignored.

Policy references: [MDN CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
and [explicit frame ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).
These defenses supplement the tested server authorization and validation.

## D. Database integrity

MongoDB/Mongoose remains the sole database layer and the application retains one
owned connection lifecycle. Imports start no sockets or workers. Startup disables
buffering and automatic indexing, verifies replica-set/sharded topology, adds and
verifies required indexes, and rejects reservation/ticket TTLs. No `syncIndexes`,
index dropping or history deletion is used. AuthSession-only TTL is cleanup, never
authentication authority.

Independent snapshot assertions verify
`Event.reservedCount = count(HELD + CONFIRMED)`, within `[0, capacity]`. An elapsed
HELD remains occupied until explicit expiration wins; it is not excluded silently.
Release updates reservation and Event together, exactly once. Confirmation commits
matching SUCCESS and CONFIRMED together without allocating another unit. A failed
or pending attempt cannot issue a ticket. Ticket ID/nonce remain stable across
replay and reconnect, with at most one per reservation. Admission changes only the
winning ticket to USED with its original admission timestamp retained on replay.

Unique/partial indexes cover active user/event holds, payment transaction and
reservation/idempotency key, and ticket reservation/nonce. Existing real index,
duplicate insertion, rollback, uncertain commit and corruption tests remain active.
No additional index was justified by this audit.

The optional Atlas probe used a fresh connection with `autoCreate=false` and
`autoIndex=false`, no product/model initialization and only read-only diagnostics.
It failed to connect; **zero writes were performed**. Actual Atlas reachability,
topology, index permissions and persistence remain unverified Task 14 prerequisites.
Disposable replica-set success is not presented as Atlas success.

## E. Concurrency results

All categories use real MongoDB transactions/conditional writes through HTTP,
except explicit worker/service orchestration where necessary to establish a race.
Each retained test asserts persisted state and inventory, not only status codes.

| Race | Observed/asserted persisted outcome | Evidence |
| --- | --- | --- |
| Capacity 1 / 20 distinct attendees | One occupied unit; no oversell | reservations integration |
| Capacity 5 / 20 distinct attendees | Five occupied units; no oversell | reservations integration |
| Same attendee / 20 holds | One active hold, unchanged original expiry | reservations integration |
| Two expiry workers | One release, retained EXPIRED record | reservations integration |
| Cancel vs expiry | One terminal release, no underflow | reservations integration |
| Booking vs organizer cancellation | Legal serialized winner; consistent event/history | reservations integration |
| Same payment key / 20 requests | One attempt, one confirmation | payments integration |
| Different keys / one reservation | One successful settlement/confirmation | payments integration |
| Payment vs expiry | Expiry cannot coexist with a committed successful confirmation | payments integration |
| Payment vs cancellation | One legal final outcome, matching capacity/state | payments integration |
| Ticket issuance / 20 requests | One stable ticket ID, nonce and credential | tickets integration |
| Check-in / 20 requests | One approval, 19 used denials, one original timestamp | check-in integration |

Current frozen publication and terminal confirmation/payment contracts underpin
single-document admission. Future refunds, transfers or mutable eligibility must
coordinate with consumption; arbitrary out-of-band writes are not claimed safe.

## F. UI and accessibility results

Real browser acceptance used the forms, buttons, guarded navigation, native local
date inputs, confirmation dialog, QR export, manual scanner and reporting controls.
Publication's keyboard focus wraps inside the dialog and its background is inert.
Mobile navigation opens from the keyboard and Escape restores its closed state.
Chart buckets support keyboard selection and complete labelled data tables.

Login, registration, discovery/cards/filters, event form, countdown/checkout,
ticket/QR, scanner and analytics were checked at **1440, 1024, 768, 390 and 320 px**.
The scanner's aspect-ratio/min-height combination originally produced a 346 px
document at 320 px; explicit bounded width fixes it. All final measured documents
fit their viewport. Tables retain intentional, labelled local scrolling where needed.
Sampled mobile controls measure 30.6–47.1 px high and at least 30.6 px wide.
The existing global reduced-motion rule disables animations/transitions and smooth
scrolling; scanner/chart rules also respect the preference.

Test-only `axe-core` 4.14.0 checks 12 actual App/AuthProvider/Router screens with
only the HTTP boundary replaced. It waits for returned data before checking
private/list screens. No detected semantic violations remain. jsdom cannot verify
rendered color contrast; that rule is disabled explicitly and its absent canvas
renderer remains null. This is **not a full WCAG conformance claim**. Browser
contrast samples and manual keyboard/layout checks complement these tests.
The real downloaded 1200×2150 PNG decodes to its original owned signed credential.
The actual 320 px browser capture also decodes to the identical credential.
Four observed browser text/background pairs measure 7.13:1, 6.67:1, 12.74:1 and
12.12:1; these samples do not establish every color pair's compliance.
See [axe's documented limitations](https://github.com/dequelabs/axe-core),
[WCAG contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Physical-camera compatibility was not exercised. Capture lifecycle and actual QR
image decoding have automated coverage; manual signed-credential admission was
verified against persisted data in the real browser. No camera permission was granted
or frame uploaded during this audit.

## G. Production readiness

The pinned Node 24/npm 11 workspace lockfile, clean install, both builds, Express
static delivery and API-before-SPA routing remain the production path. Production
HOST defaults to `0.0.0.0`; explicit HOST/PORT take precedence. A copied local `.env`
can still override the production bind and must be reviewed before hosting.
Production auth requires explicit HTTPS APP_ORIGIN and Secure/HttpOnly/SameSite=Lax
host-only cookies. No weak secret fallback, cookie downgrade or Origin bypass exists.

Readiness requires usable initialized transactional MongoDB and ping; liveness and
static delivery stay independent. The expiry worker starts after readiness, owns
its timer, drains on shutdown and uses bounded conditional transactions. SIGINT/
SIGTERM drain HTTP, worker and MongoDB within the existing shutdown budget.

Proxy trust stays false. Specify actual trusted proxy addresses/topology before
changing it; current auth limits are process-local. Shared quotas, monitoring,
backup/restore and rollback policy depend on the Task 14 host. No platform is
invented and no live infrastructure is changed.

| Verification | Observed result |
| --- | --- |
| Clean install / complete gate | `npm ci`; `npm run check`: lint, types, 394 frontend + 668 backend tests, both builds; no failures/skips/warnings |
| Unit / complete database focus | `test:unit`: 139 / 7 files; `test:db`: 529 / 12 files |
| Auth / events / discovery focus | `test:auth`: 90; `test:events`: 94; `test:discovery`: 52 |
| Reservation / payment / ticket focus | `test:reservations`: 50; `test:payments`: 55; `test:tickets`: 82 |
| Admission / analytics focus | `test:checkin`: 78; `test:analytics`: 71 |
| Frontend / connected acceptance focus | `test:web`: 394; `test:release`: 1 |
| Compiled enabled mode | Paid failure/new-key success/same-key replay, explicit free confirmation, issuance/admission, exact reporting, tenant/session/role isolation, no-store and Secure/HttpOnly cookies |
| Actual process restart | Same owned database and signing keys; business records/ticket unchanged, attendee session remains valid, copied revoked session remains denied |
| Compiled failure modes | Missing/weak/JWT-reused ticket key each preserves genuine reporting/confirmation; invalid auth and unavailable database fail private reporting closed; liveness/SPA/assets remain available |
| Production browser | Actual built home and searched discovery render under enforced CSP with no console warnings/errors; same-origin API-backed paid/free records appear |
| Lifecycle / logs | All six smoke modes and restart drain actual server/worker/connection and exit 0; captured output contains none of the ephemeral credentials/URIs/QRs |
| Local performance | Owned 100-event/2,000-EXPIRED-reservation fixture: combined report 297 / 275 / 270 ms, bounded output and organizer index observed in explain |

Focused counts overlap and must not be added to the 1,062 total. Tests run with
per-file isolation and original assertion/startup/transaction deadlines; an
available host was needed after a 100%-CPU run caused fixture failures. No failed
startup or skipped integration run was accepted as passing.

Local timings use a quiet, disposable fixture; they do not establish hosted,
payment-heavy or larger-tenant capacity. Actual HTTPS browser Secure-cookie/proxy
behavior remains Task 14 work. Push-triggered [GitHub CI](https://github.com/KaizokuHam/kairopass/actions/workflows/ci.yml)
is the final remote gate; its exact delivery commit/run is recorded in the delivery reply.

## H. Issue register

| ID | Severity | Location / evidence | Impact | Correction / verification | Status |
| --- | --- | --- | --- | --- | --- |
| T13-01 | P2 privacy | `request-logger.ts`: three real HTTP regressions reproduced raw credential-bearing URL path output | Accidentally pasted secrets could enter access logs | Source-defined templates, canonical mount scope and fixed unmatched label; nested parameter regressions | FIXED |
| T13-02 | P2 defense in depth | `app.ts`: production originally had nosniff but no CSP/frame/referrer/feature policy | Missing browser containment against embedding/injection and unnecessary referrer/feature exposure | Central production-compatible policy; tests cover HTML/assets/API/errors and development exclusion | FIXED |
| T13-03 | P2 mobile usability | `checkin.css`: actual 320 px browser document measured 346 px | Preview escapes its card and causes horizontal scrolling | Explicit 100% width/min-width zero; all five browser widths remeasured | FIXED |
| T13-04 | P3 product accuracy | `VisionPage.tsx`, `index.html`: available flows described as future/foundation | Misleading status for users/evaluator | Current factual simulated-payment/booking/ticket/check-in/analytics copy | FIXED |
| T13-05 | P2 test reliability | Cold lazy admission/ticket loading and concurrent jsdom/axe work missed existing assertion deadlines during full gates; isolated repeats passed | Nondeterministic verification obscures regressions | Compile real lazy modules before assertion timers and bound frontend workers to one, keeping actual App/HTTP assertions, isolation and waits | FIXED |
| T13-06 | P2 operational verification | No verified hosted HTTPS/proxy/Atlas environment; optional read-only Atlas probe failed | Local acceptance cannot establish public readiness or provider cookie/quota behavior | Explicit Task 14 checks below; no speculative configuration weakening | DEFERRED |
| T13-07 | P3 device coverage | No physical camera/device access exercised | Camera compatibility remains device/browser dependent | Manual browser path passed; preserve media lifecycle/image tests; verify target device in Task 14 | DEFERRED |
| T13-08 | P1 booking boundary | `reservations.service.ts`: three real-MongoDB regressions inserted a hold after a start/deadline crossing or with a lagging application clock | New capacity could be allocated after booking closed | Fresh clock after active query plus start/deadline `$$NOW` predicates in the conditional allocation write; no counter/record on rejection | FIXED |
| T13-09 | P2 verification resources | Cold host contention caused startup failures and a hot payment race's unexpected response set | Failed runs/skips were not accepted as passes; the host was later measured at 100% CPU | One fixture worker, unchanged isolation/deadlines and parallel within-suite races; serialized database runs on an available host pass the complete gate | FIXED |

The new accessibility fixture initially used incorrect list-item readiness
locators; those test-authoring errors were corrected before acceptance. They are
not classified as product defects. No confirmed open P0/P1 application defect was
found in this audit's tested scope. Deferred operational/device checks are explicit
limitations, not claims of verification.

## I. Remaining Task 14 checklist

- [ ] Select actual host/domain and provide public evaluator URL over trusted HTTPS.
- [ ] Set production HOST/PORT/NODE_ENV, exact HTTPS APP_ORIGIN and independent strong
  JWT/TICKET keys through managed secrets; review copied `.env` overrides.
- [ ] Resolve actual Atlas connection/network/TLS/credentials; verify replica-set/
  sharded topology, required additive indexes and least-privilege startup permissions.
- [ ] Verify Secure-cookie register/login/refresh/logout and protected resources through
  the real TLS proxy. Do not weaken cookies, Origin rules or certificate validation.
- [ ] Define trusted proxy addresses and multi-instance limiter/worker topology;
  verify per-user/per-IP behavior behind the actual provider.
- [ ] Run genuine paid/free booking, failure/retry/replay, QR download, admission/replay
  and reporting against owned deployment fixtures, plus restart persistence.
- [ ] Verify camera permission/device behavior and PNG scanning on a target phone;
  keep manual signed-QR fallback available.
- [ ] Measure representative payment/ticket-heavy and larger-tenant reports on the
  chosen host; retain budgets and safe unavailable states.
- [ ] Establish sanitized monitoring, readiness checks, backup/restore, release rollback
  and signing-key rotation consequences (existing static QR exports are invalidated).
- [ ] Prepare truthful 3–5 minute demo and evaluator instructions; never commit live
  passwords, tokens, signing keys or QR screenshots.
- [ ] Verify deployment CI SHA, clean repository, documentation and deadline delivery.

## J. Final verdict

**READY WITH NONBLOCKING RISKS.**

The connected product workflows, release-critical inventory/payment/admission
guards and current regression gate are verified. The confirmed P1 allocation
boundary defect is fixed; no open P0/P1 application defect remains in the tested
scope. Deployment infrastructure, actual HTTPS/proxy/Atlas acceptance and physical
camera coverage remain explicit Task 14 prerequisites. This verdict does not mark
Task 14 complete or claim that a public evaluator deployment exists.

# KairoPass mid-project engineering audit — Task 07.5

Audit date: **October 26, 2026 (Asia/Calcutta)**. Repository:
[KaizokuHam/kairopass](https://github.com/KaizokuHam/kairopass), branch `main`.
Baseline: `b6700a1b7e901c48f89a6ec5da6cf40c1ca2c7ea`.
Submission deadline: **October 27, 2026, 11:59 PM IST**.

## A. Executive summary

**Current implemented-scope health: HEALTHY after corrections.**
**Final-project completeness: incomplete, as expected at this milestone.**
**Verdict: READY WITH DOCUMENTED NONBLOCKING RISKS.**

Tasks 01–07 are implemented and verified by actual source, persistent models,
HTTP/frontend tests, authentic commits, compiled-server smoke checks, and browser
workflows. Authentication, organizer management, and public discovery are usable.
Reservation allocation, payments, QR issuance, check-in, and analytics are planned
future work; model definitions alone do not implement those workflows.

The clean baseline passed 512 tests, lint, strict types, and both builds after
npm ci. Six localized findings were corrected: raw unexpected-error diagnostics,
misclassified unsupported encodings, malformed URL routing errors, loopback-only
production defaults, stale publication controls, and frontend test worker contention.
The final full gate passes **522 tests across 24 files**: **201 frontend**, **321
backend**, with no failures or skipped tests. No confirmed P0/P1 defect remains
in the implemented scope. No actual exposed credential was identified by the
source/history checks. npm audit reports zero known advisories at audit time.

Strengths are explicit authorization/ownership, transactional cancellation and
registration, verified indexes, integer paise handling, public DTO boundaries,
stale-request protection, accessible confirmation flows, and real disposable MongoDB
tests. The main remaining risks concern completing the intended business workflows,
provider-specific deployment/TLS/Atlas verification, older-form overwrite semantics,
and unmeasured search/load behavior. They are separated from confirmed defects below.

### Completed milestone evidence

| Task | Actual implementation and evidence | Status |
| --- | --- | --- |
| 01 | npm workspaces, React/Express foundation, health/static/API separation, strict tooling, CI; commits 37dc2d5–718219e | Implemented and verified |
| 02 | Five business models, connection/readiness, additive indexes, transaction/index tests; MongoDB foundation starts d26febc; Task 03 later adds AuthSession | Implemented and verified |
| 03 | Argon2id, minimal HS256 JWTs, hashed session identifiers, persisted-role authorization, exact Origins, revocation; milestone 945fd54 | Implemented and verified |
| 04 | Real auth forms/provider, guarded dashboards, safe return routes, unavailable-state handling; milestone fb4ec4e | Implemented and verified |
| 05 | Owned create/list/detail/edit/publish/cancel, frozen published economics, cancellation transaction, version predicates; milestone b74b8e0 | Implemented and verified |
| 06 | Organizer workspace, shared form, exact money/local-time conversion, explicit confirmation, real dashboard data; milestone 896ab28 | Implemented and verified |
| 07 | Public upcoming/PUBLISHED visibility, strict projected DTO, search/filter/sort/pagination, marketplace/details; milestone b6700a1 | Implemented and verified |
| 08–14 | Reservation/payment/ticket/check-in/analytics engines and final delivery requirements are absent or planned | Not yet implemented — planned for later tasks |

The latest four pre-audit GitHub Actions runs were confirmed successful for Tasks
04–07. Their heads match the milestone commits. No concurrent remote edits were
present when the audit began; the working tree was clean and safely synchronized.

## B. Official rubric evaluation

The official weights below total **100%**. Core Implementation, Engineering Logic,
and Architecture total **60%**; completing correct, transactional workflows in those
areas takes priority over decorative changes. Readiness is qualitative, not an
estimated grade, guaranteed mark, or prediction of the evaluator's score.

Classification terms:

- **Implemented and verified**: observed behavior supported by current tests/smoke evidence.
- **Implemented but insufficiently verified**: code/configuration exists, but a relevant environment or scale has not been exercised.
- **Not yet implemented — planned for later tasks**: authorized roadmap work, not an existing bug.
- **Defective — requires correction**: reproducible baseline defect; fixed findings are explicitly marked FIXED.
- **At risk for final submission**: delivery/workflow gap requiring attention before the deadline.

| Evaluation area | Official weight | Implemented evidence / verified functionality | Missing final requirements | Engineering weaknesses / findings | Risk | Recommended improvements | Final-evaluation readiness |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| Problem & Product Understanding | 10% | README identifies attendees/organizers, disconnected event journey, simulated-only payments; UI/roadmap distinguish available and upcoming behavior | Final demo must explain the complete intended journey and actual limits | No recorded 3–5 minute final product demo | Medium delivery risk | Prepare a concise demo using real persisted workflows; update it after later milestones | Product rationale ready; final demonstration pending |
| Core Product Implementation | 25% | Registration/login/restoration/logout; complete organizer lifecycle; real public discovery with filters/details; refresh persistence verified | Ticket reservation, payment confirmation, QR issuance/entry, analytics | Only organizer management is complete among all five intended business journeys; discovery is the implemented portion of the second | High final-completeness risk | Execute Tasks 08–12 with real durable outcomes, then run cross-workflow acceptance | Implemented scope verified; final product not ready |
| Engineering & Application Logic | 20% | Transactions, conditional lifecycle writes, ownership, current roles, safe integer paise, publication/deadline/inventory constraints, real concurrency/index tests | Atomic holds/expiry, payment replay/state transitions, issuance/check-in idempotency, correct analytics | A01–A03 error boundaries and A05 stale controls corrected; future schemas do not enforce every service invariant | Medium extension risk | Revalidate every future allocation in a transaction; retain history; test retries, races, and rollback | Strong foundation; later engine logic still required |
| Architecture & Technical Decisions | 15% | MERN modular monolith, thin controllers/services, dedicated DTOs, single Mongoose lifecycle, startup index verification, same-origin production delivery | Hosting-specific configuration/measurements and future module implementations | A04 bind default corrected; long-lived edits lack client revision preconditions; substring search has bounded but unmeasured scaling | Medium | Keep module boundaries; introduce only justified service contracts; measure queries and deployment behavior | Suitable to begin Task 08 with documented constraints |
| User Experience & Reliability | 10% | Loading/empty/error/success states, safe errors, retry, guarded identity, local dates, exact prices, focus-trapped confirmations, responsive actual workflows | Booking/payment/ticket failure/recovery UX; final hosted/browser acceptance | A05 elapsed publication window corrected; clock labels remain device-clock dependent; no proactive cross-tab renewal | Medium | Extend existing accessible patterns; use authoritative booking responses; verify hosted expiry/recovery | Current screens verified; whole journey pending |
| Code Quality & Project Structure | 10% | Strict TypeScript, zero-warning ESLint, domain folders, typed clients/runtime parsing, authentic small commits, meaningful HTTP/DB/RTL tests | Later modules and final integration/hardening coverage | A06 first-render test timeouts under high jsdom concurrency mitigated with four workers; no numerical coverage baseline | Low–medium | Preserve assertions/isolation; add tests for real gaps and future races; measure targeted coverage when useful | Healthy current structure and tests |
| Deployment & Documentation | 10% | Reproducible lockfile/install/build, Express SPA/assets, configurable PORT/HOST, health/readiness, detailed contracts and roadmap, CI | Public evaluator URL, persistent Atlas/replica set, HTTPS/domain, secrets, trusted proxy/rate-limit policy, backup/restore and final demo | A04 fixed; actual cloud/TLS/Atlas environment not provisioned or exercised; proxy trust intentionally false | High final-delivery risk | Complete the deployment checklist below in Task 14; validate end-to-end Secure-cookie behavior through the real proxy | Buildable and locally deployable; hosted evaluator access pending |
| **TOTAL** | **100%** | Current implementation quality is evidenced separately from roadmap completion | Final acceptance requires remaining workflows and accessible deployment | No invented academic score | — | Prioritize the 60% core/logic/architecture block | **Midpoint readiness, not final completion** |

## C. Issue register

All findings below were reproduced or observed; no speculative vulnerability is
presented as an exploit. P2 findings were localized and safe to correct in this audit.

| ID | Severity | File/component | Baseline evidence / reproduction | Impact | Correction | Status |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | P2 | server/src/middleware/error-handler.ts | An isolated failing route throwing a synthetic private canary put that message in console.error; client JSON was already sanitized | Unexpected exception messages could put private diagnostics into logs | Log fixed metadata/requestId only; preserve safe 500 JSON; regression asserts absence of canary in both output channels | FIXED |
| A02 | P2 | Global JSON/error boundary | POST JSON with unsupported charset or content encoding returned 500 INTERNAL_ERROR | Caller input was falsely reported as a server outage | Allowlisted parser errors return 415 UNSUPPORTED_MEDIA_TYPE with safe message and no-store | FIXED |
| A03 | P2 | server/src/app.ts, pre-router URL boundary | /api/events/%ZZ was intercepted as a discovery/database failure (503 while disconnected); other malformed escapes could become internal errors | Invalid URLs were misclassified and could generate misleading operational errors | Validate path encoding before router/static decoders; safe 400 INVALID_URL across public/private/assets paths | FIXED |
| A04 | P2 | server/src/config/env.ts, .env.example, README | NODE_ENV=production plus platform PORT, without HOST, selected 127.0.0.1 | A container/platform cannot reach the default listener through its network interface | Default production to 0.0.0.0, retain local loopback for dev/test, preserve explicit HOST and platform PORT; document copied-local-env override | FIXED |
| A05 | P2 | EventActions.tsx, useAvailabilityClock.ts | Publication checked time only at mount; a controlled clock crossing the deadline left the existing page's Publish button enabled | Avoidable stale action/server conflict; an already-open confirmation also needed to expire | Reuse the boundary clock for organizer publication; disable page/confirmation after deadline/start and explain expiry; backend remains authority | FIXED |
| A06 | P2 | client/vitest.config.ts | One full run with default concurrent scheduling across 14 jsdom files had two initial-route findByRole timeouts; environment setup time rose from roughly 25–30s aggregate to 88.65s | Load-sensitive local verification, potential flaky CI | Cap concurrent workers at four; retain every test, assertion, isolation setting, and timeout; comparison run and final normal full gate passed | FIXED |

### Remaining risks, distinct from current defects

| ID | Priority / classification | Area | Evidence and impact | Required action / owner milestone | Status |
| --- | --- | --- | --- | --- | --- |
| R01 | P1 delivery risk — At risk for final submission | Hosted evaluator access | No deployed public application/Atlas/TLS environment was supplied or provisioned; local smoke cannot verify provider routing or Secure-cookie behavior through TLS | Configure and verify the actual deployment in Task 14, including a public demo URL; external infrastructure provisioning was outside this audit | DEFERRED |
| R02 | P2 — Implemented but insufficiently verified | Query throughput | Search is literal case-insensitive substring matching, counts scan matches, and pagination uses skip/limit; no representative volume/load benchmark | Measure indexed query plans/latency and traffic limits in Tasks 13–14; retain bounded outputs/timeouts | DEFERRED |
| R03 | P2 documented contract limitation | Old edit forms | Conditional server writes detect overlapping operations; an old descriptive form submitted after a completed edit has no ETag/revision precondition and can overwrite that field | Add a deliberate client revision contract if required during hardening; coordinate API/UI/tests rather than changing it silently | DEFERRED |
| R04 | P2 operational risk | Proxy/rate limits and secrets | trust proxy=false prevents spoofed forwarding; a real reverse proxy can share one socket IP quota. Limits are in-memory; no shared limiter store or managed signing configuration exists | Specify trusted proxy addresses and deployment storage/secret policy for the actual host in Task 14; never blindly trust forwarded headers | DEFERRED |
| R05 | P3 verification gap | Browser/security hardening | Actual cloud HTTPS, broad browser matrix, assistive-technology review, representative load, and a finalized production CSP/frame policy were not exercised | Validate and harden the real deployment in Tasks 13–14; no accessibility-conformance or penetration-test certification is claimed | DEFERRED |

There is no known actual exposed credential requiring rotation from this audit.
Credential-format scans checked reachable Git history without printing candidate
values. Credential-bearing MongoDB strings found in current source were synthetic
failure fixtures in tests. If a real secret is later discovered, rotate it; deleting
its text in a new commit would not revoke it.

## D. Verification results

### Commands and observed results

| Check | Observed result |
| --- | --- |
| git status/remote/history, fetch + safe synchronization, gh api user | Clean main at b6700a1; correct KaizokuHam account/repository; no incoming changes at start |
| npm ci | Passed, 439 packages installed / 442 audited; zero reported vulnerabilities |
| Baseline npm run check | Passed: 512 tests / 24 files, lint, both type checks, both builds |
| npm audit --json | Passed: 0 info/low/moderate/high/critical advisories; no dependency changes needed |
| Initial added HTTP regressions | Six failures reproduced the three HTTP/log boundary findings; 22 existing app cases remained passing |
| npm run test:unit after HTTP correction | 65 passing; after two environment regressions the final unit total is 67 |
| npm run test:auth | 90 passing / 2 files |
| npm run test:events | 94 passing / 3 files |
| npm run test:discovery | 52 passing / 1 file |
| Focused event/public clock workflow tests | 27 passing / 2 files, including the two new organizer deadline cases |
| Initial final full run | 321 backend passed; frontend 199 passed / 2 first-render timeouts under high concurrency. This failed run was investigated, not labeled green |
| Four-worker comparison frontend run | All 201 passed / 14 files without assertion/timeout changes |
| Final normal npm run check | **Passed: 522 total, 201 frontend + 321 backend, 24 files, 0 failed, 0 skipped** |
| npm run lint / npm run typecheck / npm test / npm run build | All executed by the final check; zero lint warnings, zero TypeScript errors, all tests passing, both production builds successful |
| Tracked source/config/history hygiene | No tracked secret files, node_modules, build output, artifacts, skip/todo tests, unsafe HTML rendering, eval, or any/ts-ignore escape hatches found by the targeted scans |
| Remote CI | Pre-audit milestone runs confirmed green; the exact post-audit revision and Actions conclusion are verified at delivery |

Ten meaningful regressions were added: six HTTP/log cases, two bind/configuration
cases, and two publication clock cases. Existing coverage was retained. Frontend
tests replace fetch and use actual forms/providers/router behavior. Backend suites
exercise real MongoDB persistence, indexes, transactions, auth, visibility, and
controlled concurrency; targeted fault injection is used for failures and barriers,
not as a substitute for database business behavior.

No numeric coverage percentage is claimed: the optional Vitest coverage provider
is not installed. Review focused on behavioral gaps, real failure reproduction,
authorization, and cleanup rather than adding dependencies for a superficial metric.
The initial fake-clock interaction test used user-event timers and timed out;
the deterministic boundary regression now uses RTL's synchronous click with explicit
clock advancement. It still exercises the real dialog/provider/event handlers.

### Automated workflow and integrity evidence

Authentication tests cover both public roles, normalized unique email races,
Argon2 verification, transaction rollback, generic bad credentials, minimal JWT
claims/algorithm/issuer/audience/expiry, backing session deletion/revocation/expiry,
current persisted roles, independent sessions, duplicate cookie rejection, exact
Origins, rate limits, spoofed forwarding, cookie flags, and safe DB/hash failures.

Organizer tests cover owned reads/writes, unowned 404s, attendee/guest rejection,
strict bodies, merged validation, integer money, publish/cancel transitions,
frozen economics, retained history, active-inventory checks, and controlled real
edit/publish/cancel/allocation races. Publication and cancellation do not allocate
inventory or manufacture reservations.

Discovery tests cover anonymous published/future access, draft/cancelled/past
exclusion, closed/sold-out visibility, explicit DTOs, literal metacharacters,
query injection/length/date validation, inclusive UTC filters, sort ties,
MongoDB page/count consistency, timeouts, and unavailable auth/database behavior.
Frontend tests cover URL/back state, stale and aborted requests, identity isolation,
unavailable versus signed-out sessions, exact currency/local dates, confirmations,
response validation, and disabled future booking controls.

All six models, shared options, and index initialization were reviewed. Actual
partial uniqueness, failed-attempt history/idempotency keys, ticket uniqueness and
random nonce generation, no reservation TTL, transaction commit/rollback, standalone
rejection, shutdown/reconnection, and credential-safe database failures are tested.
References alone do not enforce existence/ownership, raw writes bypass model hooks,
and future workflows still need transactional services; these limits are documented.

### Compiled-server smoke (actual HTTP and owned MongoDB)

The corrected production build starts **without HOST supplied**, binds to 0.0.0.0
at a chosen platform-style PORT, and serves real client JS/CSS and SPA routes.
Smoke checks passed for draft invisibility, publication visibility, public
search/filter/pagination/DTOs, frozen published price, cancellation exclusion with
private retained history, copied-session rejection after logout, and safe logs.

With invalid JWT configuration, public discovery returned 200 and private management
503. With an unavailable database both returned 503. Health and compiled frontend
delivery stayed 200 in both scenarios. These checks do not claim a real hosted
HTTPS/Atlas deployment or external proxy verification.

### Fresh browser observation (separate from automated assertions)

An owned MongoDB 8.2.6 replica set, ephemeral signing key, local Vite/API processes,
and disposable audit.organizer/audit.attendee `.test` accounts were used. No shared,
application, Atlas, or production database was cleaned or mutated.

Manually observed through browser automation:

- Organizer registration, actual account data, refresh/session restoration,
  wrong-password feedback, subsequent successful login, logout, and guest redirects.
- Invalid empty event form focuses its first field and shows associated errors.
- Paid Audit Systems Workshop draft persisted ₹149.50 and capacity 40; edit changed
  capacity to 45; it stayed hidden from public discovery until confirmed publication.
- Publication dialog initially focuses Keep editing; Escape closes and restores
  Publish focus. Five published schedule/economics inputs were read-only; venue
  edits persisted. Public search/paid/venue filters and price sorting found the event;
  public detail reload retained the correct values and search URL.
- Confirmed cancellation retained the private event/history and removed it from
  public discovery. Mobile creation/publication of free Audit Community Lab
  persisted ₹0.00/capacity 25; public details showed the disabled reservation CTA.
- Attendee registration, organizer-route denial, own-dashboard recovery, functional
  Explore Events navigation, logout, and anonymous public browsing.
- 1440px desktop, 768px tablet, and 375px mobile screens inspected; DOM width checks
  showed no horizontal page overflow. Mobile dialog bounds fit the viewport and
  controls were usable; collapsed filters and compact navigation worked.
- Captured browser warning/error log list was empty. Tool-level selector/screenshot
  timing retries were not treated as application defects.

Two-page pagination, boundary-clock expiry, obsolete-response races, network failure,
and database unavailable UI states were verified automatically; not every such
scenario was repeated manually in this audit. Earlier Task 07 manual pagination
evidence remains in its historical acceptance record. The current retained-history
screenshot is saved in ignored artifacts/audit-organizer-history.png. The temporary
browser tab, viewport override, API/Vite processes, and owned replica set were closed.

## E. Corrective changes

Corrections preserve valid API contracts, MERN architecture, authentication,
organizer ownership, public visibility, inventory semantics, and the existing visual
identity. No new dependency, database connection, business engine, or rewrite was added.

1. **HTTP/log boundary**: safe 400/415 classification prevents invalid caller input
   from masquerading as outages. Unexpected logs retain request correlation without
   raw exception messages. Every error response is no-store.
2. **Production binding**: environment parsing selects a reachable production
   default and continues honoring explicit HOST and PORT. A copied development
   .env still needs its explicit loopback HOST removed/changed when hosted.
3. **Publication clock**: share the existing start/deadline timer with organizer
   controls and confirmation. The general hook requires only its two date fields,
   so organizer/public DTOs remain separate. Expiry never fabricates a server result.
4. **Test reliability**: bound concurrent jsdom workers rather than relaxing checks.
   Test isolation, fake-clock cleanup, real provider/router execution, all suites,
   and default assertion timeouts are preserved.

Corrective commits are 7418516 (API), 625ceb1 (binding), b7dd974 (clock), and the
subsequent test-runner/audit documentation commits visible in Git history. Published
history was not rewritten, backdated, or force-pushed. Final remote HEAD and the
push-triggered CI conclusion are reported with the delivery.

## F. Remaining roadmap and deployment readiness

| Milestone | Prerequisites already verified | Required implementation/verification in that task | Ready to start? |
| --- | --- | --- | --- |
| 08 — Reservation Engine | Transactional topology/readiness, safe occupied inventory, active user/event partial unique index, expiration scan index, event lifecycle predicates and cancellation race tests | Validate persisted attendee and public eligibility; reconcile elapsed HELD records; conditionally increment the same PUBLISHED event and insert price-snapshot hold in one transaction; implement idempotent expiry/release, concurrency/rollback tests, no reservation TTL | Yes, with explicit transactional integration requirements |
| 09 — Simulated Payment Gateway | PaymentAttempt amount/identity fields and real transaction/idempotency unique indexes; failed retry history retained | Validate reservation ownership/amount/expiry; durable replay and payload consistency; atomic SUCCESS/confirmation, failure paths; no real money/card data | Foundation exists; implement after Task 08 |
| 10 — QR Ticketing | Reservation-ticket uniqueness, cryptographic nonce defaults and uniqueness tests | Issue only for eligible confirmed reservation, idempotent issuance, dedicated environment HMAC key, canonical signed payload, verification tests | Foundation exists; payment/confirmation and signature service still required |
| 11 — Check-In | Ticket status/timestamp model and persisted organizer authorization patterns | Resolve ticket through reservation/event, authorize organizer ownership, verify signed payload, conditionally transition ISSUED/null to USED/time exactly once; race tests | Start after ticket service; no check-in engine exists yet |
| 12 — Analytics | Retained timestamps/state, failed attempt history, reservation/event and payment history indexes; MongoDB aggregation approach | Derive attendance from actual check-ins and simulated revenue from legitimate successful confirmed states; avoid counting retries/failures twice; handle monetary aggregate bounds | Data foundations exist; workflow records and metrics logic still required |

The intended five business journeys have different completion states: organizer
management is implemented; discovery is implemented but ticket reservation is not;
simulated payment, QR entry, and organizer analytics remain unimplemented. The
presence of schemas/indexes is preparation, not completion of those journeys.

### Deployment checklist for Tasks 13–14

- [x] Reproducible npm workspace install/build and Node 24 compatibility.
- [x] Compiled single-origin Express serves SPA routes and real JS/CSS; API/missing
  assets remain JSON errors rather than misleading HTML success.
- [x] Platform PORT and reachable production HOST default verified; explicit overrides retained.
- [x] Liveness independent of database; readiness verifies topology/indexes/ping.
- [x] Missing signing configuration fails private authentication closed; production
  config requires HTTPS APP_ORIGIN and Secure/HttpOnly/SameSite cookies.
- [x] Source/history hygiene and current dependency advisory audit performed.
- [ ] Provision persistent owned Atlas/replica set, credentials, restricted network
  access/TLS, and verify actual production readiness/index permissions.
- [ ] Configure a public evaluator URL, HTTPS/domain, environment signing secret,
  NODE_ENV=production, APP_ORIGIN, and provider PORT/HOST settings.
- [ ] Define trusted proxy/address policy and rate-limit storage for the actual
  host; do not enable trust proxy=true as a generic workaround.
- [ ] Verify browser registration/login/restoration/logout over real HTTPS through
  that proxy, persistent events after process restarts, and shutdown/recovery.
- [ ] Measure relevant query/load behavior; finalize CSP/frame and other deployment
  protections, monitoring, backups/restore, and release rollback instructions.
- [ ] Run completed 08–12 workflows, final integration/hardening, and a truthful
  3–5 minute demo. Provide working evaluator access and documented test accounts
  through an appropriate private channel, never committed credentials.

Suggested current-scope demo: briefly explain users/simulated payments; sign in;
create/edit/publish an event; discover/filter/view it anonymously; show cancellation
exclusion and retained history; show authorization and CI evidence. Explicitly state
that booking/payment/ticket/analytics are not implemented yet. Replace/extend that
sequence with real later workflows for the final submission, without fake success.

## G. Final audit verdict

**READY WITH DOCUMENTED NONBLOCKING RISKS.**

Task 08 can begin on the verified foundations. The current fixes are small,
regression-covered, and preserve security and existing workflows. No current
critical/high-priority code blocker was confirmed. The delivery/deployment risks
must still be resolved before final evaluation, and later engines must implement
their transactional and idempotency contracts rather than rely on schema enums or
frontend availability. This audit does not mark Tasks 08–14 complete.

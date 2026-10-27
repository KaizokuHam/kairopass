# KairoPass academic submission package

Prepared **2026-10-27 (Asia/Calcutta)** for the deadline **27 October 2026,
11:59 PM IST**. This document is a submission aid. No official academic form
has been uploaded or submitted by preparing it.

## Project identity

**KairoPass — event discovery, reservations, simulated checkout and secure admission.**

Attendees find events, reserve a place, confirm through simulated checkout and
carry a signed digital ticket. Organizers publish events, verify entry once and
report bookings, attendance and exact simulated revenue.

- Repository: [github.com/KaizokuHam/kairopass](https://github.com/KaizokuHam/kairopass).
- Source branch: [main](https://github.com/KaizokuHam/kairopass/tree/main).
- Stack: MongoDB/Atlas, Mongoose, Express, React/Vite, Node 24, strict TypeScript.
- Architecture: modular monolith; one Express process serves React assets and
  same-origin API, with transactional MongoDB persistence.
- Payment model: **simulation only; no real money collected**.

## Deployment

| Submission field | Actual status / entry |
| --- | --- |
| Public application URL | **Not yet verified — do not submit a placeholder URL** |
| Hosting provider | Render Node Web Service configuration prepared; service creation unverified |
| MongoDB Atlas | Read-only connectivity/topology confirmed with process-local DNS diagnosis; dedicated identity/index initialization/write transactions still unverified; writes: 0 |
| HTTPS verification date | Not tested |
| Health/readiness verification date | Not tested in public production |

Use [production-verification.md](production-verification.md) to record the actual
URL, timestamps and observed workflow results after deployment. A build or CI
badge is not proof of a reachable application.

## Source and verification

Task 13 release baseline: `c81629f1c808ab5847f57b9ac2549c804727738c`, with
[successful exact-head CI](https://github.com/KaizokuHam/kairopass/actions/runs/40522838785).
Its complete gate passed 1,062 tests / 42 files, lint, strict types and both builds.
Task 14's clean install and complete local gate also pass the same 1,062 tests,
lint, types and both builds. Compiled production paid/free/admission/restart smoke
checks passed on a disposable replica set. Final Git/CI details belong in the
[production verification record](production-verification.md). Use the latest
published `main` SHA and corresponding **successful**
[CI run](https://github.com/KaizokuHam/kairopass/actions/workflows/ci.yml) in the final
academic form. Confirm with `git rev-parse origin/main`; do not copy an earlier
milestone hash as the final deployment revision.

## Demonstration

**Video: not recorded or uploaded.** No public video link is available.
The [five-minute script and shot list](demo.md) includes preparation, exact
navigation, suggested voiceover, expected real fixture outcomes and privacy checks.
Record with a supported trusted recorder, watch it fully, upload to the student's
chosen authorized destination, and verify evaluator access before inserting a URL.
Do not submit a fake video link or describe a script as a completed recording.

## Five functional workflows

1. **Organizer management:** create/edit drafts, publish eligible future events,
   list owned history and cancel only when inventory permits.
2. **Discovery and booking:** public upcoming search/filter/sort and transactional
   one-ticket reservations with a ten-minute server-owned deadline.
3. **Simulated checkout:** durable PENDING attempts, failure history, explicit retry,
   same-key replay and atomic SUCCESS + CONFIRMED.
4. **Ticketing and admission:** one backend-signed ticket per eligible confirmation,
   PNG export/wallet, organizer camera/manual verification and single-use entry.
5. **Analytics:** organizer-owned read-only current/period metrics, exact simulated
   paise totals, conversion, attendance and accessible UTC trends/tables.

## Engineering differentiators

Event inventory and reservation transitions commit together, with capacity and
database-clock predicates. Payment idempotency binds immutable request intent.
Ticket HMAC uses an independent secret and persisted random nonce; current
eligibility plus one atomic Ticket transition prevents replay approval. Reporting
deduplicates retries before joining, sums exact integer paise and never mutates
business data. Authentication uses HttpOnly production Secure cookies and live
revocable MongoDB sessions; authorization checks current roles and resource owners.

## Setup and evaluator instructions

Start with the [README](../README.md), [deployment runbook](deployment.md) and
[database setup](database.md#local-development). Local verification uses Node
24.14+ below 25, npm 11+ and an owned replica set. `npm ci` and `npm run check`
reproduce the automated gate; tests never clean an Atlas database.

Once a public URL is verified:

1. Choose **Get started**, register an **Organizer** account using an address you
   control and a private password, then open Organizer Events.
2. Create a paid demo event with price ₹249.50/capacity 10. Set start 60–90 minutes
   ahead, end three hours ahead and registration deadline 45 minutes ahead in the
   displayed browser timezone. Publish through the confirmation dialog.
3. Create a second free event with price ₹0 and the same valid schedule. Published
   dates, capacity and price are frozen; create a new event if the demo window passes.
4. Log out. Browse **Explore Events** anonymously and search the demo title.
5. Register an **Attendee** account. Open the paid event, reserve one ticket and
   inspect the real ten-minute countdown and amount.
6. Select simulated failure, observe retained HELD/payment history, then explicitly
   try a new successful attempt before expiry. No financial credentials are required.
7. Generate the actual ticket, open My Tickets, download the PNG and refresh to
   confirm persisted identity. Repeat explicit zero-value checkout for the free event.
8. Log in as the event's organizer. Open the event's **Check-in**. Scan with a
   supported HTTPS camera or paste the complete privately decoded signed credential.
   A ticket ID alone is insufficient. Keep full QR content out of URLs, recordings,
   chat and source control. The [demo preparation](demo.md) explains local decoding.
9. Admission opens two hours before start and ends at event end. Observe approval
   once, then Already Used with the original timestamp on explicit replay. Refresh
   the attendee wallet to see USED with no active QR/download.
10. Open **Analytics**, filter to these events and compare real bookings, simulated
    gross revenue, failed attempts and check-ins. One paid plus one free confirmation
    contributes ₹249.50, two successful simulations and two bookings; one admitted
    ticket gives 50% attendance only when exactly those two confirmations exist.
11. Log out and verify protected navigation requires a new session. Private event,
    booking, ticket and reporting resources enforce roles/ownership on the server.

No shared demo password is published. Evaluators self-register. Existing real
published demo fixtures can be linked here only after they are created and tested;
none is claimed available in public production yet.

## Rubric evidence map

Official weights total 100%. These are evidence locations, **not estimated marks**.

| Area | Weight | Evidence |
| --- | ---: | --- |
| Problem & Product Understanding | 10% | README problem/users and demo introduction |
| Core Product Implementation | 25% | Five workflows, browser acceptance and module contracts |
| Engineering & Application Logic | 20% | Transaction, idempotency, nonce/admission and aggregation contracts; real replica-set tests |
| Architecture & Technical Decisions | 15% | Architecture/database docs, DTO/service boundaries, same-origin deployment |
| User Experience & Reliability | 10% | Responsive/keyboard checks, recovery states and accessible charts/dialogs |
| Code Quality & Project Structure | 10% | Strict TypeScript, lint, isolated tests, conventional history and CI |
| Deployment & Documentation | 10% | Actual HTTPS/Atlas acceptance when verified; deployment/demo/submission docs |

See the [Task 13 audit](release-readiness.md) for actual findings and remaining
hosted acceptance requirements. Local evidence does not earn an invented grade.

## Known limitations

Simulated payments collect no money. Public organizer registration is an academic
policy. Free hosting sleep/quota can delay service/expiry; proxy trust remains
false and may group auth rate-limit buckets. Process-local limiters are not
distributed. Static tickets are copyable; first valid admission wins, without
proving the presenter's identity. Key rotation invalidates old QR exports.
Physical-camera compatibility and cloud capacity require actual device/host
verification. No refund/transfer/confirmed-cancellation/revocation-creation
workflow is implemented. Video, public deployment and official submission must
be verified independently.

## Submission checklist

| Deliverable | Prepared | Verified | Uploaded / submitted |
| --- | --- | --- | --- |
| Source repository | Yes | Task 14 local gate and production smoke passed; final head/CI pending | Existing main published; Task 14 publication pending |
| Public app / Atlas | Configuration and runbook | No public acceptance yet | Service creation unverified |
| Documentation | README, deployment, demo, submission and evidence ledger | Local links/secret review passed | Task 14 publication pending |
| Demo video | Exact script/shot list | Recording absent | Not uploaded |
| Academic form | Entries below prepared | Form URL/account not provided | **Not submitted** |

Exact form entries that can already be used:

- **Project name:** KairoPass.
- **Description:** MERN event booking platform with transactional ten-minute
  reservations, idempotent simulated checkout, signed QR tickets, replay-safe
  admission and organizer analytics.
- **Repository:** https://github.com/KaizokuHam/kairopass.
- **Stack:** MongoDB Atlas/Mongoose, Express, React/Vite, Node.js, TypeScript.
- **Live URL / video URL:** leave unresolved until actual links are verified.
- **Release SHA / CI URL:** copy the final actual main SHA and its successful run.

No official form URL or authenticated academic submission account was supplied.
The student must review final fields, upload any required files/links, submit
through the official portal and retain the actual confirmation/receipt. Do not
mark the project submitted merely because its GitHub source is public.

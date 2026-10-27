# Task 14 production verification record

Date: **2026-10-27 (Asia/Calcutta)**. Repository:
[KaizokuHam/kairopass](https://github.com/KaizokuHam/kairopass), branch `main`.
Starting SHA: `c81629f1c808ab5847f57b9ac2549c804727738c`.
Task 13 is complete and its
[exact-head CI passed](https://github.com/KaizokuHam/kairopass/actions/runs/40522838785).

## Current release boundary

**DEPLOYMENT PREPARED — USER ACTION REQUIRED.**

No public HTTPS URL is verified. This record distinguishes preparation/local
evidence from actual cloud acceptance; it must be updated after deployment.
It does not claim completion of Task 14 or academic submission.

## Access and configuration observed

| Check | Actual observation |
| --- | --- |
| Git identity / repository | Authorized `KaizokuHam`; correct origin; clean main baseline, fetched and fast-forward synchronized |
| Existing provider access | Render sign-in, GitHub authorization pending; Railway sign-in; Atlas sign-in |
| Connected hosting capability | Dedicated Render and Atlas integrations found but not confirmed connected; existing site builders require a different architecture |
| Deployment configuration | `render.yaml`: single Node Free web service, root build/start, Node 24.14.0, `/api/ready`, CI-gated deployment, managed secret inputs |
| Local environment names | All documented application names present; presence does not establish valid production configuration |
| Local signing configuration | JWT_SECRET and TICKET_HMAC_SECRET fail canonical strong-key requirements; no values printed or copied into deployment |
| Atlas URI structure | SRV form with credentials; no explicit database path; no value printed |
| Read-only Atlas connection | System DNS fails SRV with ECONNREFUSED/querySrv; process-local public resolver returns three SRV records and connects successfully; replica-set/sharded topology confirmed; writes: 0 |
| Atlas authorization metadata | Existing credential has a broad database role, not database-scoped readWrite on kairopass; do not reuse it as the production application identity |
| Application database metadata | kairopass has none of the six application collections/index sets yet; deployment startup/index initialization and write transactions remain unverified |
| Public service / TLS / database writes | Not created or verified in preparation |
| Demonstration recording | Not recorded/uploaded; exact script and shot list prepared |

The original ECONNREFUSED occurs at the system resolver's querySrv operation,
before authentication. A separate process-only resolver proves the existing
credential can reach Atlas; no operating-system/app DNS configuration was changed.
It does not prove that Render's network is allowed or that write transactions and
indexes work. Keep TLS enabled. A production URI needs an explicit selected
database and a dedicated least-privilege identity; do not alter the existing broad
user's permissions without understanding any other applications that use it.

## Local and remote verification

| Gate | Result |
| --- | --- |
| Task 14 clean install | PASS — 474 packages installed, 477 audited, 0 reported vulnerabilities |
| Task 14 lint / types / tests / builds | PASS — npm run check executed lint, types, npm test and both builds: 394 frontend / 23 files + 668 backend / 19 files; zero failures/skips/warnings |
| Blueprint schema validation | PASS locally against Render's official JSON Schema with temporary ajv-cli; URI-format checks were not supplied by that validator, repo URL checked separately; authenticated dashboard acceptance remains unverified |
| Task 14 secret / link / artifact inspection | PASS — 44 local file links across five documents; 0 configured secret matches in source/history/client build; only two reviewed synthetic URI fixtures; no credential-bearing screenshot committed |
| Compiled production smoke | PASS locally — enabled/missing/weak/reused ticket key, invalid auth and unavailable DB; paid/free confirmation/replays, ticket/admission, reporting, real process restart and graceful cleanup |
| Local small report timing | 100 disposable events / 2,000 EXPIRED reservations: 502 / 391 / 316 ms; organizer index observed; not a hosted capacity guarantee |
| Task 14 verified configuration/document publication | PASS — main candidate `5b9e1ac7520ba7350467f6a55409796bc9d682e3`, [exact-head CI successful](https://github.com/KaizokuHam/kairopass/actions/runs/40530208677); live remote ref checked |
| Published README rendering | PASS — actual GitHub screenshot and Mermaid diagram rendered; no live deployment claim |
| Task 13 complete baseline | PASS — 1,062 tests / 42 files, no failures/skips; lint/types/both builds |

Tests use disposable local replica sets, ignoring application MONGODB_URI. No
live cleanup, destructive Atlas tests, fabricated production data or simulated
report success was used. Task 13 browser/compiled lifecycle results are in
[release-readiness.md](release-readiness.md); they are local evidence.

The publication above records the verified configuration candidate. This evidence
record may be followed by documentation-only commits. Use the current
[main history](https://github.com/KaizokuHam/kairopass/commits/main/) and its
[CI run](https://github.com/KaizokuHam/kairopass/actions/workflows/ci.yml) for the
exact final source revision; the delivery report records that final SHA/run.

Publication commits:

- `847ea2d5cbed017b10fdf9f920f399ce52e52869` — build(deploy): prepare single-origin
  Render release and readiness runbook.
- `5b9e1ac7520ba7350467f6a55409796bc9d682e3` — docs(release): prepare evaluator guide
  demo script and submission package.

## Live acceptance ledger

No URL or hosted test evidence is currently available. Every row below is
**NOT TESTED** in public production, regardless of existing local coverage.

| Area | Public status | Required evidence |
| --- | --- | --- |
| HTTPS / home / assets / navigation | NOT TESTED | Trusted certificate, actual compiled assets, correct assigned URL |
| Health / readiness | NOT TESTED | 200 on both, after Atlas topology/index/ping initialization |
| API / asset 404 and deep refresh | NOT TESTED | JSON API boundary, missing asset 404, SPA browser route refresh |
| Register / login / me / refresh / logout | NOT TESTED | Actual HTTPS browser, Secure/HttpOnly/host-only cookie, persisted revocation |
| Organizer management / ownership | NOT TESTED | Real private published paid/free events; second organizer denied |
| Guest discovery | NOT TESTED | Published upcoming events persist and can be found anonymously |
| Reservation / expiry | NOT TESTED | Real hold/deadline, hosted cleanup timing, once-only release, confirmed unit retained |
| Simulated checkout | NOT TESTED | Durable failure/new-key retry/success/replay and unchanged original unit/amount |
| Ticket issuance / wallet / PNG | NOT TESTED | Genuine confirmation evidence, stable ticket after refresh/restart, actual decodable export |
| Admission / replay | NOT TESTED | Manual credential approves once; replay denies with original timestamp; wallet USED |
| Free checkout | NOT TESTED | Explicit zero-value confirmation/issuance, no added simulated revenue |
| Analytics | NOT TESTED | Actual filtered paid/free totals, retained failure attempts, read-only reporting |
| Role / tenant / invalid QR protection | NOT TESTED | Owned limited demo actors, no unrelated details or unauthorized approval |
| Mobile / keyboard / console | NOT TESTED | 1440/768/390 layout, no mixed-content/CSP/CORS failure, usable dialogs/manual entry |
| Restart persistence / logs / small read timings | NOT TESTED | Same database/keys, durable identity/session/state, sanitized logs and actual host timings |
| Physical camera | NOT TESTED | Target HTTPS phone/browser and explicit permission; manual path remains mandatory |

## Remaining account-owner actions

1. Review/authorize the concrete Render GitHub sign-in request or connect the
   dedicated Render integration. If account creation/terms are required, complete
   them personally. No paid plan is authorized.
2. Sign in to Atlas or connect its integration. Select the actual cluster/database,
   dedicated user and restricted service-egress allowlist. Do not share credentials
   in chat or commit them.
3. Create the prepared service, supply the missing **valid production** settings
   (MONGODB_URI, APP_ORIGIN, CLIENT_ORIGIN, JWT_SECRET, TICKET_HMAC_SECRET), then
   verify public acceptance using [deployment.md](deployment.md).
4. Record actual URL, deployed SHA, health/readiness time and every live result
   above. Prepare retained demo records through the public app.
5. Record/watch/upload the walkthrough and verify its audience access. Complete
   the student's official academic form and retain its actual confirmation.

## Risks ranked by release impact

1. **Public access is unverified:** account authorization and a real service are
   still required; no evaluator live link exists in this record.
2. **Atlas production identity/secrets are unfinished:** read-only connectivity
   and topology work, but a scoped user, index initialization and actual hosted
   transactions are not verified; local signing keys are invalid.
3. **Hosted operational limits:** free sleep/quota and conservative proxy-shared
   auth buckets need deliberate acceptance; no hosted capacity guarantee.
4. **Demo delivery:** video and official submission remain separate user actions.
5. **Device coverage:** physical-camera compatibility remains untested; manual
   signed-credential admission has local verification only.

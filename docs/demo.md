# Five-minute KairoPass demonstration

**Recording status: not recorded or uploaded.** Browser automation supports
screenshots, not a screen-recording capability. No supported recorder has been
confirmed in this release environment. This is a preparation script, not a claim
that a video or live deployment exists. Use an available trusted screen recorder
on the student's computer and verify the resulting file before uploading.

## Prepare before pressing Record

1. Finish [deployment acceptance](deployment.md#public-acceptance-checklist).
   Use the actual verified HTTPS URL, never an invented domain. Warm the free
   service once before the demonstration and confirm `/api/ready` 200.
2. Register dedicated organizer and attendee accounts through the app. Choose
   distinct addresses controlled for the demo and strong private passwords.
   Keep credentials in a password manager/private note, never this repository,
   slides, narration, recording or submission form. Evaluators can self-register;
   no public shared password is required.
3. Create a paid event titled **KairoPass Live Demo — Paid**: price ₹249.50,
   capacity 10, venue **Demo Hall**, with a factual demonstration description.
   Set start to 60–90 minutes from now, end three hours from now and registration
   deadline 45 minutes from now. The form shows the browser's timezone. Publish
   through its confirmation dialog. Keep dates future at the actual recording time.
4. Create/publish **KairoPass Live Demo — Free**, price ₹0, capacity 10, with the
   same valid schedule. Do not change frozen published times through database writes.
5. Rehearse without consuming the ticket intended for the final take. Once USED,
   it cannot be reset. For a new take, create a clearly labelled new event/cohort
   or another owned attendee's booking; retain old booking/payment/admission history.
6. Use two isolated browser profiles or separate browsers for the two roles if
   available. Otherwise perform logout/login at the indicated cuts. Two tabs in
   the same browser profile share cookies and cannot hold independent identities.
   Do not expose or manually edit session cookies to switch roles.
7. Have private manual credential access ready. The current attendee screen does
   not provide a Copy full credential control. Prefer scanning the exported PNG
   with a supported local QR reader. A developer rehearsal may privately read the
   owned ticket-detail response and transfer its full `qrPayload` to manual entry.
   Do not capture DevTools, response bodies or the credential while recording.
   Never paste it into a URL, online decoder, chat or browser storage.
8. Prepare views: `/`, `/organizer/events`, `/events`, the attendee reservation,
   ticket wallet, organizer event Check-in and Analytics. Open the repository
   and successful exact-release GitHub Actions run for the final engineering shot.
9. Disable notifications, hide password-manager overlays and unrelated tabs,
   enlarge browser text if needed, and record at a readable desktop size. Capture
   a short 390 px layout shot separately if the recorder supports clean editing.
10. Cover the QR region and credential field in the published recording. Show
    ticket identity/status and the PNG-download result without distributing an
    active credential. Never record deployment secret fields, `.env`, terminal
    secret-generation output, session cookies or Atlas connection dialogs.

## Exact shot and voiceover script

| Time | Screen and action | Suggested narration |
| --- | --- | --- |
| 0:00–0:20 | Actual public home, clear project name and URL | “KairoPass connects attendees and event organizers in one application: discovery, booking, simulated checkout, digital tickets, entry and reporting. Payments are simulated; no money is collected.” |
| 0:20–0:55 | Organizer Events; show the paid event's title, schedule, capacity and price; show publication confirmation in a prepared draft if time allows | “Organizers create drafts and explicitly publish them. The server checks ownership and valid dates. Publication freezes schedule, capacity and price so later bookings keep consistent terms.” |
| 0:55–1:30 | Guest Explore Events, search the exact demo title, open details; switch to attendee | “Anyone can browse published upcoming events and filter by venue, dates and price. Displayed availability is a snapshot. The server decides whether a place can actually be reserved.” |
| 1:30–2:20 | Reserve one ticket; show real countdown and amount; simulate failure, then explicit new-attempt success | “A reservation atomically holds one unit for ten minutes. Failed simulation leaves the valid hold and attempt history intact. An explicit retry gets a new idempotency key; successful payment and confirmation commit together. Replaying a request cannot confirm or count revenue twice.” |
| 2:20–3:05 | Generate ticket, refresh detail, download actual PNG; keep QR covered; briefly show free confirmation if already prepared | “Only a genuinely confirmed booking with durable successful-payment evidence can receive one ticket. The backend generates the nonce and signs a minimal payload. The wallet and PNG use the same persisted ticket identity. Free events also require explicit zero-value checkout.” |
| 3:05–3:40 | Owning organizer Check-in; cut over private paste/scan; show Entry Approved; explicitly submit same credential again and show Already Used with original time | “The signature is only one check. The server verifies the organizer, event, booking, payment, nonce and admission window. One conditional database update approves entry. Presenting the same ticket again is denied and retains the original admission time.” |
| 3:40–4:20 | Organizer Analytics filtered to both demo events; show current vs period, UTC trend/table and actual simulated totals | “Reporting reads the organizer's persisted records without changing inventory. It deduplicates payment attempts, sums exact paise and separates current inventory from period activity. These are simulated revenue, booking conversion and cumulative attendance—not payouts or real receipts.” |
| 4:20–4:50 | Repository architecture diagram, contract docs and actual successful CI; brief responsive shot if time permits | “This is a strict TypeScript MERN modular monolith. Express serves React and the API on one origin; Mongoose uses a transactional MongoDB deployment. The automated gate includes real isolated replica-set races, ownership, recovery and read-only analytics checks.” |
| 4:50–5:00 | Home/project title and verified live/source links, no account data | “The source, setup guide, deployment runbook and known limits are linked in the README. Evaluators can register their own organizer and attendee accounts to repeat the complete journey.” |

If the final recorded take omits the free workflow for time, show its zero-value
confirmation and effect in the supporting screenshots/notes. Do not narrate an
unperformed action as verified. Rehearsal footage from localhost must be labelled
local; it cannot substitute for a public HTTPS acceptance claim.

## Expected fixture outcomes

For a fresh filtered cohort with one paid booking, one free booking, one failed
paid attempt followed by successful retry, and only the paid ticket admitted:

| Observation | Expected persisted result |
| --- | --- |
| Confirmed bookings | 2 |
| Successful simulated payments | 2 |
| Failed simulated attempts | 1 |
| Simulated gross revenue | ₹249.50 (24950 paise); free adds 0 |
| Tickets after both are generated | 2, with one USED and one ISSUED |
| Admissions | 1, unchanged by replay |
| Cumulative attendance | 50%, if this cohort has exactly two confirmations |
| Occupied inventory | One confirmed unit in each event; confirmation/check-in do not release it |

Use actual filters and data. Earlier rehearsals, retained expired holds, period
boundaries or other attendees change totals and conversion. Explain them rather
than forcing these values. Conversion uses confirmed/all reservations in the
same creation cohort, so it may differ from attendance.

## Additional verification outside the five minutes

- Leave a separate hold for its original ten-minute deadline; observe worker/lazy
  expiry and exactly-once release, preserving confirmed inventory and history.
- Verify refresh/login/logout/revocation, wrong-role and second-organizer isolation,
  invalid QR rejection, public deep refresh and JSON API 404.
- Verify 1440/768/390 layouts and console. Physical camera/device compatibility
  remains separate from manual-entry and real-image decoding results.
- Restart the deployment with unchanged database and keys, then read stable
  bookings, payment history and ticket identity. Do not resubmit admissions merely
  to create a nicer recording result.

## Save, upload and submit

Export a readable MP4 using the recorder's supported settings. Watch the entire
file, listen to the audio, confirm 3–5 minute length, and check every frame for
passwords, cookies, signing keys, URI credentials and live QR data. Redo or redact
credential-bearing footage before sharing. A screenshot slideshow is not evidence
of a completed live workflow recording.

Upload only to the student's chosen authorized destination. Confirm the evaluator
can view the link in a signed-out browser, then add the **actual** URL to
[submission.md](submission.md). “Recorded,” “uploaded,” “accessible” and “submitted”
are separate checks. No upload or official academic submission has occurred merely
because this script exists.

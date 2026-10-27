# Public event discovery — Task 07

Visitors, attendees, and organizers can browse persisted published events without
signing in. `/events` and `/events/:id` use the same Express/Mongoose application
as private organizer management. There are no production event fixtures, image
uploads, popularity metrics, or fake booking confirmations. Task 08 adds real
[reservation writes](reservations.md) through a separate protected attendee API.

## Architecture and visibility

`server/src/modules/discovery` separates routes, thin controllers, query validation,
services, public types, and an explicit mapper. It reuses the Event model and the
single readiness-checked MongoDB connection. Importing the module never connects.
Both public services enforce `status: PUBLISHED` and `startAt > request-time now`.
This policy cannot be relaxed through query parameters or by sending a cookie.

- DRAFT, CANCELLED, missing, and already-started events are excluded from listing.
- Those events and malformed ObjectIds return the same 404 `EVENT_NOT_FOUND`
  through public details, including for the event's organizer.
  Malformed URL percent/UTF-8 encoding is rejected earlier with global 400 INVALID_URL.
- Organizers retain their existing authenticated historical access and ownership
  checks under `/api/organizer/events`; no management authorization is weakened.
- An upcoming event with an elapsed deadline or no remaining inventory stays
  visible. Publication alone does not mean registration is open.
- The readiness guard runs before handlers. With an unavailable database these
  routes return 503, including requests that would otherwise be not found.

## HTTP contracts

| Method/path | Result |
| --- | --- |
| `GET /api/events` | `{ success: true, data: { events, pagination } }` |
| `GET /api/events/:id` | `{ success: true, data: { event } }` |

Successful reads return 200. All discovery responses use `Cache-Control: no-store`.
No authentication or trusted Origin is required for these read-only endpoints.
Malformed or expired auth cookies do not block public browsing. Authentication
configuration is independent: a valid MongoDB connection can serve discovery even
when missing/weak JWT configuration disables private endpoints.

The dedicated twelve-field public DTO contains only:

```typescript
interface PublicEvent {
  id: string;
  title: string;
  description: string;
  venue: string;
  startAt: string;
  endAt: string;
  registrationDeadline: string;
  capacity: number;
  reservedCount: number;
  pricePaise: number;
  status: 'PUBLISHED';
  createdAt: string;
}
```

Dates are normalized UTC ISO strings; prices are nonnegative safe integer paise.
The database projection and response construction both allowlist fields. No
organizer ID/email, populated account, `_id`, `__v`, updated timestamp, session,
payment, reservation record, or credential is returned. There is no user join.

Errors retain the existing `{ success: false, error: { code, message, requestId } }`
envelope. Invalid listing parameters return 400 `INVALID_DISCOVERY_QUERY`.
Query execution timeout returns 503 `EVENT_QUERY_TIMEOUT`; unavailable database
returns 503 `DATABASE_UNAVAILABLE`. Unexpected failures use a safe 500 contract.
Driver messages, query contents, credentials, and internal metadata are not exposed.
Failures are never converted into successful empty pages.

## Query contract

Example: `/api/events?q=cloud&venue=Bengaluru&price=paid&sort=soonest&page=1&limit=12`

| Parameter | Accepted values / behavior |
| --- | --- |
| `q` | Optional trimmed literal substring of title OR venue, case-insensitive; maximum 120 UTF-16 code units |
| `venue` | Optional trimmed literal venue substring, case-insensitive; maximum 200 code units; combined with q using AND |
| `price` | `all` (default), `free` (pricePaise = 0), `paid` (pricePaise > 0) |
| `from` | Optional valid ISO date-time with Z or explicit ±HH:MM offset; inclusive earliest start |
| `to` | Optional valid ISO date-time with Z or explicit ±HH:MM offset; inclusive latest start |
| `sort` | `soonest` (default), `latest`, `price_asc`, `price_desc` |
| `page` | Positive decimal integer, default 1, maximum 10,000; no signs, leading zeros, decimals, or exponents |
| `limit` | Positive decimal integer, default 12, maximum 50; same integer syntax |

Unknown/repeated parameters, query arrays/objects, unsupported enum values,
overlong strings, impossible dates, ambiguous timezone-free dates, and `from > to`
are rejected. Empty/whitespace-only q and venue are unfiltered. Regex metacharacters
are escaped; callers cannot supply patterns or MongoDB operators. Description
search is deliberately omitted. All supplied filters intersect the mandatory
upcoming/PUBLISHED policy, so an old from boundary cannot reveal past events.

Dates filter **event start instants**, not whole-day overlap. An offset boundary
is converted to the same UTC instant without reinterpreting its timezone. Example:
`from=2026-11-10T15:30:00%2B05:30` means 10:00 UTC. A date-only value is rejected;
clients must deliberately choose boundaries rather than silently appending Z.

| Sort | Deterministic MongoDB order |
| --- | --- |
| soonest | startAt ascending, _id ascending |
| latest | startAt descending, _id descending |
| price_asc | pricePaise ascending, startAt ascending, _id ascending |
| price_desc | pricePaise descending, startAt descending, _id descending |

MongoDB performs filtering, sorting, skip/limit, and counting. One aggregation
input feeds page and total facets; Node.js never loads the dataset to paginate it.
Metadata is `{ page, limit, total, totalPages: Math.ceil(total / limit) }`.
An empty match has totalPages 0. A valid page beyond the end has an empty events
array with actual totals. Later reads can reflect intervening writes or time.

The existing `event_discovery` index is preserved. Additive, startup-verified
`event_public_schedule` (status/startAt/_id) and `event_public_price`
(status/pricePaise/startAt/_id) indexes support stable ordering and reverse scans.
No live indexes are dropped or synchronized destructively. Each discovery database
query has a 2-second execution budget and bounded output. Literal case-insensitive
substring filtering is not a full-text search index; it may inspect many upcoming
published candidates. Large datasets will need measured search/cursor improvements,
and possibly infrastructure-level traffic limits. No external search service or
unbounded in-memory fallback is introduced.

## Frontend experience

`ExploreEventsPage` composes a search form, reusable filter form, public event cards,
feedback/skeleton states, sort controls, and pagination. `PublicEventDetailsPage`
shows the actual description, local start/end/deadline, venue, exact INR price,
remaining/total capacity, and availability. Cards use a consistent date/gradient
treatment because Event has no artwork field. They show no invented social proof.
Shared organizer price/date utilities avoid a second currency/time implementation.

`services/discovery.ts` reuses the relative-path GET client, same-origin cookies,
no-store caching, safe errors, abort support, and request timeouts. Runtime parsers
reject unexpected/private fields, malformed dates, invalid inventory/prices, and
inconsistent/duplicate pagination results. Public hooks do not depend on session
restoration: browsing works for guests, either role, and unresolved/unavailable auth.
Protected organizer reads remain separately scoped by verified identity.

All applied search/filter/sort/page/limit state lives in URL parameters. Title/venue
keyword search waits 300 ms; explicit Search applies immediately. Other filters
apply through the labeled Apply filters form; sorting applies immediately. Major
changes reset page one, including a pagination click while keyword input is pending.
Filter inputs preserve their draft values until application or clearing. Malformed
URLs use safe normalized query values with a visible recovery notice; private and
unknown values are never forwarded. Card detail links carry the search parameters,
and Back to Explore Events restores that view, including after refresh.

Requests are keyed by resource/query and retry attempt. Abort controllers and
generation checks ignore obsolete responses and hide previous results immediately
when the resource changes. Failed reads stay failures with explicit retry; no
private/shared persistent cache or localStorage/sessionStorage state is added.

Local date-time filter controls name the browser timezone and convert real local
calendar components to UTC, including DST-gap validation. From/through boundaries
are inclusive exact instants; through is not automatically extended to day's end.
Event displays use en-IN formatting in the browser timezone and retain ISO values
in semantic time elements. There is no separate timezone picker.

Availability precedence is deterministic:

1. Non-published or startAt <= now: **Event started / unavailable**.
2. registrationDeadline <= now: **Registration closed** (even when sold out).
3. capacity - reservedCount <= 0: **Sold out**.
4. Otherwise: **Registration open**.

An availability clock updates known time boundaries while the page stays open
and when the tab becomes visible. Inventory/status remain the latest loaded
snapshot; refresh/navigation revalidates visibility, and a cancelled event becomes
not found. Device clock skew can affect public labels. Task 08 replaces the disabled
placeholder with Sign in to Reserve / Reserve Ticket, an organizer restriction, or
disabled unavailable controls. Allocation authoritatively revalidates publication,
time, deadline and inventory inside its transaction; these labels never authorize
a reservation. Payment and ticket workflows remain separate future work.

Public navigation, the existing home exploration CTA, and the attendee dashboard
link to /events. Sign-in/account controls remain role-aware. Responsive layouts
include mobile collapsible filters/navigation, real buttons/labels, keyboard focus,
semantic headings, live loading/error feedback, and no horizontal overflow at the
verified widths. Existing reduced-motion preferences remain in effect.

## Verification and limits

Use Node.js 24.14+ / npm 11+ and the repository commands:

```sh
npm ci
npm run test:discovery # 52 real HTTP/MongoDB integration tests
npm run test:web       # All frontend tests, including discovery and reservations
npm run test:db        # Discovery plus existing model/auth/organizer integrations
npm run check         # Lint, both type checks, all tests, both builds
```

Two additional disconnected public-route checks complement the discovery suite:
54 new backend tests in total. Existing regressions stay active. Previous assertions
that /api/events was unimplemented now check its private-draft exclusion instead;
hard deletion remains absent. Task 08 separately verifies real reservation writes
and attendee navigation; tickets remain unavailable until Task 10.

Tests own unique disposable MongoDB 8.2.6 replica sets and never consume application
MONGODB_URI for cleanup. Frontend tests replace only fetch, exercising actual
components, router, session provider, stale reads, clock boundaries, and interaction.
Real browser and compiled-server evidence is recorded in the
[verification guide](production.md#verification).

Persistent use requires an owned replica set/Atlas configuration; sign-in/management
also require valid JWT/Origin configuration. Tests provision no production database
or signing secret. No images, categories, geo-search, recommendations, historical
public pages, live inventory push, cursor search, payment, or ticketing are included
in this discovery module. Actual reservation allocation is implemented separately
in Task 08. Public sold-out snapshots can lag expiration until cleanup or an
authoritative reservation request reconciles inventory; explicit refresh rereads
the Event. The [verification guide](production.md#verification)
contains current full-suite and booking/browser verification.

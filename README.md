# Hairtopia Studio — Salon OS (V2 Final)

Built by **Coratech AI** for Hairtopia Studio (266 Afro Osro Street, Accra).

A full-stack salon operating system: central client CRM, public team showcase
with real computed ratings, online booking with deposits and rescheduling,
a payment-provider abstraction (MTN MoMo-ready, idempotent, rate-limited),
discovery consultations, full staff HR, inventory, walk-in/QR queue,
geofenced attendance, reviews, an owner dashboard, reporting, Web Push/PWA
notifications with per-category preferences, a scheduled-reminder job, and
an automated test suite — all on top of the original Hairtopia V1 system,
preserved throughout.

**Read "Known limitations" near the end before assuming every line item in
the original spec is finished.** This README states plainly what's real,
what's a stub, and what's simply not built.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS**
- **Drizzle ORM + SQLite** (via `better-sqlite3`)
- **Custom JWT session auth** (via `jose`), bcrypt password hashing
- **Vitest** for automated tests (77 tests, real database, real JWT sessions)
- **web-push** for Web Push notifications (VAPID)
- Server Actions for all mutations, one file per domain under `src/lib/actions/`

## Getting started

```bash
npm install
npm run db:push                               # creates/updates data/hairtopia.db from the schema
npm run db:seed                               # seeds real Hairtopia pricing + demo accounts
npx tsx scripts/seed-natural-hair-services.ts # adds the 13 Natural Hair Services (idempotent)
npx tsx scripts/seed-makeup-services.ts       # adds Soft Glam / Full Glam / Bridal Makeup + Terms (idempotent)
npm run dev                                   # http://localhost:3000
```

### Running the tests

```bash
npm test          # runs the full suite once (77 tests)
npm run test:watch
```

Tests run against a **dedicated** `data/test.db` (never your dev database),
created fresh by pushing the real schema via `drizzle-kit push` before the
suite starts. They exercise the actual server actions, the actual database,
and actual JWT session verification — only the Next.js framework boundary
(`next/headers`, `next/cache`) is mocked, since those don't exist outside a
running Next server.

### Demo accounts (local dev only)

| Role     | Phone      | Password    |
|----------|------------|-------------|
| Owner    | 0240000001 | owner123    |
| Manager  | 0240000002 | manager123  |
| Stylist  | 0240000003 | stylist123  |
| Customer | 0240000006 | customer123 |

There's no seeded "admin" (Trusted Admin) — create one from `/admin/staff`,
or promote a user's role directly for a quick look. Change all of this
before going live. Don't run `npm run db:seed` against production; the two
`seed-*-services.ts` scripts ARE safe to run once against production data.

## Environment variables

See `.env.example` for the full list with explanations. Only
`SESSION_SECRET` is required to run the app at all. Everything else
(MTN MoMo, VAPID push, cron secret) is optional and the app degrades
honestly — never silently — when unset.

## Database & migrations

No separate migration runner — `drizzle-kit push` diffs `schema.ts` against
the live file and applies additive changes. Every schema change across
this whole project has been additive only (new tables, new
nullable/defaulted columns, new enum values). Verified repeatedly this
pass: pushed onto a database seeded with real V1+V2 data, re-pushed a
second time (idempotent, zero diff), and row counts/sample records
confirmed unchanged.

## Authorization & roles

Roles: `customer`, `stylist`, `manager`, `admin` (Trusted Admin), `owner`.
`admin` has the same operational access as `manager`/`owner` everywhere
except a handful of owner-only settings/business-rule actions, unchanged
from V1.

**Client privacy** (`src/lib/crm.ts` → `assertClientAccess`), enforced
server-side on every read/write:
- **Owner / Admin** — full access
- **Manager** — operational access; private front-of-house `notes` stripped out
- **Stylist** — only clients they have an appointment assigned to; never sees `notes`
- **Customer** — only their own linked client record

**Service eligibility** (`src/lib/eligibility.ts` → `isStylistEligible`) is
enforced server-side at **every** point a professional gets attached to an
appointment — online booking, walk-in, queue assignment, reschedule, and
consultation conversion — not just filtered in the booking wizard's UI.
This was a real gap found and fixed during this pass: a crafted request
could previously book an ineligible stylist for a service they'd never
been assigned to.

## Main modules

### Client CRM
Central client table matched by normalized phone across online booking,
walk-in, and consultations. Hair/scalp intake, visit history, photos
(privately stored — see "File uploads" below), server-side privacy scoping.

### Team showcase (`/team`)
Public, filterable-by-category profiles with ratings computed live from
moderated, non-hidden reviews only — never a hand-typed number. Categories:
Hair Stylist, Nail Technician, Lash Technician, **Makeup Artist**, Other
Beauty Professional. Set from `/admin/staff/[id]`'s Professional Profile
panel, alongside the actual service-assignment checkboxes (see next
section) — this panel didn't exist before this pass; the underlying
`updateStylistServices` action existed but had zero UI callers.

### Professional ↔ Service assignment (`/admin/staff/[id]`)
Real UI, wired to the eligibility system above. Assigning a Makeup Artist
to Bridal Makeup makes them eligible in the booking wizard immediately;
unassigning removes them. Verified end-to-end by an automated test that
assigns a stylist, confirms they're offered for the service, and confirms
an unassigned stylist is rejected server-side even with a hand-crafted
request naming them directly.

### Natural Hair Services & Makeup
The 13 spec-named Natural Hair Services and the Makeup category (Soft Glam
GH₵200–300, Full Glam GH₵350–450, Bridal Makeup GH₵1,500/"1 look") are
added via idempotent seed scripts as real database rows. Range-priced
services get their exact final price confirmed by staff via
`setAppointmentFinalPrice`, server-validated against `[priceMin, priceMax]`.

### Reusable service Terms & Conditions
`service_terms` table, versioned (`publishServiceTerms` never overwrites —
it deactivates the old version and inserts a new one). Owner/Admin edit
terms from each service's row on `/admin/services`. `createAppointment`
**server-side rejects** a booking if the service has active terms and the
submitted `acceptedTermsId` doesn't match the current version — a
client-side checkbox is never trusted alone — and the exact version
accepted is permanently stamped on the appointment.

### Booking, deposits, overbooking & overtime
The deposit (GH₵100 flat by default, configurable) is computed and
enforced server-side. **Overbooking and overtime genuinely change what
slots the engine offers** — this was verified, not assumed: automated
tests book a slot, confirm the buffer blocks the next slot, turn
overbooking on and confirm the buffer-only gap opens up (while the actual
service duration itself never becomes bookable), and separately confirm a
late slot only appears once `overtimeAllowedMinutes` is raised.

### Rescheduling (new this pass)
Full workflow, not just a database field: a customer requests a new
date/time (blocked entirely inside the cancellation window — same policy
as cancellations — with the new slot's availability checked server-side
excluding the appointment's own current slot); staff review from
`/admin/requests` and approve or decline; approval **re-validates
availability again** at that moment (something else may have been booked
in the meantime) before moving the appointment, and notifies the customer
and both the old and new assigned professional. Full audit trail via
`appointmentStatusHistory` and `auditLogs`.
`/admin/requests` also now handles pending **cancellation** requests —
`resolveCancellationRequest` existed from an earlier pass but, like
`updateStylistServices`, had no UI calling it until this pass.

### Payment architecture & MTN MoMo
`PaymentProvider` interface; `ManualProvider` (cash/card/bank) is real and
production-ready. `MtnMomoProvider` is an honest architectural stub — see
`src/lib/payments/provider.ts` for exactly what's real vs. simulated.

**Idempotency (fixed this pass, was a real bug):** `confirmMomoCallback`
now applies the financial effect of a successful callback via a single
atomic `UPDATE ... WHERE status NOT IN ('paid','refunded')` — not a
read-then-write pair — so a duplicate callback (which MTN's own docs warn
can happen) can never double-count a deposit. Verified with a test that
fires 8 *simultaneous* identical "successful" callbacks at one payment and
confirms the deposit is applied exactly once.

**Webhook security:** `/api/webhooks/momo` requires a shared secret
(`MTN_MOMO_CALLBACK_SECRET`) via header — MTN's callback mechanism has no
built-in HMAC signing to verify against, so this is the actual recommended
practice for this integration, not an invented substitute. Rate-limited
independently as defense in depth. **Not yet done:** IP allowlisting
(a reverse-proxy/WAF concern, not application code) and the optional
extra hardening step of re-confirming via a server-to-server GET to MTN's
status endpoint before trusting a callback body (documented in the file,
intentionally not force-wired in since it would just return "pending"
against the current stub and make testing impossible).

**Booking-wizard payment step:** after confirming a booking that needs a
deposit, the customer is prompted for their MoMo number and a real
`initiateCustomerDeposit` call is made — not a fake "payment successful"
screen. Since MoMo isn't live, this honestly reports "not configured" with
a "pay later at the salon" fallback; the code path is complete and ready
for when real credentials are added.

**Other real financial bugs found and fixed by the test suite this pass:**
a too-small deposit was incorrectly confirming bookings; a **full** payment
was NOT confirming them (opposite bug, same root cause — the old code only
special-cased `paymentType === "deposit"`); sequential partial payments
didn't accumulate correctly; there was no overpayment guard at all; and
refunds updated the payment row but never actually restored the
appointment's balance. All four are fixed via a single
`recomputeAppointmentPaymentState` function that recomputes from the
payments table itself rather than patching numbers incrementally, plus a
real `refundedAmount` column for correct partial refunds.

### Discovery consultations
Public request → staff review → recommendation → conversion to a real
appointment (through the same eligibility check as regular booking).
Reference photos are stored **privately** (see below) and now actually
shown in the admin review UI (`listConsultations` joins them, `/admin/
consultations` renders thumbnails) — previously upload worked but nothing
displayed them. The specifically-requested professional is notified
directly, not just back-office roles.

### Staff HR, Inventory, Reviews, Audit log
Unchanged in substance from the prior pass — contracts/warnings/no-shows/
advances/uniforms, inventory with movement history and low-stock alerts,
moderated real ratings, and a comprehensive audit trail. **Inventory
concurrency was a real bug, fixed this pass:** `recordInventoryMovement`
now runs inside a single synchronous SQLite transaction
(`db.transaction(..., { behavior: "immediate" })`), not a separate
read-then-write. A forced-interleaving test fires 10 simultaneous "take 1"
requests against 4 units in stock — the old code let all 10 succeed
(going to -6); the fixed code lets exactly 4 succeed and the rest fail
cleanly, stock lands at exactly 0.

### Reporting & dashboard
Revenue by period, deposits, outstanding balances, payments by method,
appointment status breakdown, popular services, unique clients vs.
appointments (salon-wide and per-stylist), and now **Consultations**
(total, completed, converted, declined) — previously missing from
`/admin/reports` entirely.

### Notifications: in-app + Web Push, with real per-category preferences
`notify()` creates an in-app notification and always attempts a Web Push
dispatch. **Preferences are now per-category, not just global on/off**
(`notification_preferences` table: booking, reminders, payments,
consultations, cancellations/rescheduling, staff/HR, queue, system) —
`users.pushEnabled` remains the master switch; if it's off, nothing below
it matters. Enforced server-side in `sendPushToUser`, with UI on the
account/stylist/admin pages.

**Event coverage, re-audited this pass** (see `src/lib/notify.ts` call
sites across every action file): every customer, professional, and
admin/manager/owner event from the spec is wired, **including fixes found
during this specific re-audit**:
- The customer is now notified on their own "payment received" / "booking
  confirmed" / "payment failed" — previously only staff heard about a
  payment at all.
- `admin` (Trusted Admin) was missing from four separate "new booking"
  staff-notification lists that only included manager/owner — fixed.
- Staff-rule publishing, staff no-shows, and the specifically-requested
  consultation professional now all fire real notifications — none of
  these existed before this pass.
- The cancellation **approval** path (as opposed to a direct staff cancel)
  now also notifies the assigned professional — previously only the
  customer heard about it.

Reminders (`src/lib/reminders.ts`) are dispatched by a secured,
scheduler-triggered endpoint — see "Scheduled jobs" below — and
deduplicated against the `notifications` table itself, so calling the
endpoint repeatedly or on overlapping schedules never double-sends.

### Web Push / PWA
Real service worker (`public/sw.js`, handling `push` + `notificationclick`),
real manifest + icons generated from the actual Hairtopia logo, VAPID
subscribe/unsubscribe wired through `web-push`, per-device subscriptions
with automatic cleanup on a 404/410 from the push service.

**What was verified:** a real VAPID keypair was generated and used to send
an actual signed `web-push` request from Node — confirmed the request
construction and error handling both work as the dispatch code expects.
**Not verified:** delivery to a real browser/device (none available in
this environment) or over a real network path (this sandbox's egress
policy blocks outbound requests to push services like FCM — production
deployment needs to allow that, which is a normal Web Push requirement,
not specific to this codebase). Lock-screen/background behavior on Android
or iOS has **not** been tested on a real device.

### Scheduled jobs (new this pass)
`POST /api/cron/reminders` — call it from your deployment's scheduler
(Vercel Cron, a server crontab with `curl`, GitHub Actions on a schedule,
etc.) every 15–30 minutes. **Secured**: requires `CRON_SECRET` to be set,
and the caller must send `Authorization: Bearer <CRON_SECRET>` — with no
secret configured the endpoint returns 503 and does nothing; with the
wrong token it returns 401. Verified live in all three states. Example
crontab line once `CRON_SECRET` is set:

```
*/20 * * * * curl -s -X POST https://yourdomain.com/api/cron/reminders -H "Authorization: Bearer $CRON_SECRET"
```

### Rate limiting (new this pass)
`src/lib/rate-limit.ts` — a real in-memory limiter applied to login,
booking creation, availability lookups, consultation requests, review
submission, push subscription, payment initiation, and both upload/webhook
routes. **Honest limitation, stated in the file itself**: this is
per-process memory. On the single-server deployment this app targets,
that's genuinely effective. If you ever scale to multiple instances,
replace it with a shared store (Redis/Upstash) behind the same
`checkRateLimit` signature — nothing else needs to change. Verified live:
hammering the MoMo webhook 65 times in a row returned exactly 60
successes then 429s.

### Automated tests (new this pass)
77 tests across 8 files (`npm test`), all against the real database and
real JWT session verification:
- `unit.test.ts` — phone normalization, deposit math, the rate limiter
- `crm.test.ts` — client matching/dedup, full privacy-scope matrix
- `booking.test.ts` — eligibility enforcement, availability/buffers,
  overbooking/overtime actually changing availability, terms enforcement,
  range-price validation
- `payments.test.ts` — the full payment lifecycle, MoMo pending/success/
  failure, the 8-simultaneous-callback idempotency test, refunds,
  authorization boundaries
- `momo-idempotency.test.ts` — the specific audit-flagged bug, isolated
- `inventory.test.ts` / `inventory-race.test.ts` — movements, low-stock
  alerts, and the forced-interleaving concurrency test
- `business-flow.test.ts` — the full "Bridal Makeup customer journey"
  scenario end-to-end: eligibility → booking → terms → deposit → MoMo
  callback → notifications → reschedule → completion → review → rating

**What this is NOT:** browser-based E2E (no Playwright/Cypress — no
browser tool was available in this environment) and not exhaustive
coverage of every UI interaction. It is real integration testing of the
actual server logic, which is where the financial and authorization bugs
listed throughout this README were actually found.

## File uploads

Three paths:
- **General** (`/api/upload` — gallery/completed-work): public, unchanged
  from V1, fine for content meant to be public.
- **Client photos** (`/api/upload/client-photo` + `/api/client-photos/
  [filename]`): stored under `private-uploads/`, outside `public/`, never
  served statically. Every read re-checks `assertClientAccess` per request.
- **Consultation photos** (`/api/upload/consultation-photo` +
  `/api/consultation-photos/[filename]`): same private-storage principle,
  added this pass — previously these went through the public upload route.
  Readable by back-office staff or the specifically-named professional.

## Security summary (re-audited this pass)

- No secrets in source or the packaged ZIP (checked again this pass).
- Two real authorization gaps found and fixed in code written during this
  same pass, before shipping: `getNotificationPreferences` and
  `unsubscribeFromPush` had no ownership check at all — fixed to require
  the caller be the subscription's own user or back-office staff.
- Client/consultation photo private-storage fix (see above).
- MoMo idempotency and webhook shared-secret (see above).
- Rate limiting on every public-facing mutation endpoint (see above).
- `getPaymentStatusForAppointment` (used by the booking wizard's payment
  step to poll status) is intentionally keyed only by the appointment's
  UUID and returns no PII — the same "unguessable capability link" pattern
  as an order-tracking page, not a data leak.
- **Not done:** a formal penetration test, IP allowlisting for the MoMo
  webhook, and browser-based CSRF token rotation beyond what Next.js
  Server Actions provide natively (same-origin header checks, built into
  the framework).

## Known limitations (honest, not hidden)

- MTN MoMo is a stub — real credentials + the one remaining wiring change
  noted in `/api/webhooks/momo/route.ts` are needed to go live.
- Web Push delivery to a real device is unverified (no device/browser
  available here); the code is real and the request construction was
  proven against real VAPID keys.
- No browser-based E2E test suite.
- Multi-tenant (multi-salon) support is not implemented — out of scope by
  request, and nothing was done to make it harder to add later.
- The rate limiter is single-process in-memory (documented above).
- Consultation reference photos aren't shown in a lightbox/full-size
  viewer — thumbnails only, opening the authenticated URL in a new tab.

## Project structure

```
src/
  app/            Routes — public site, /book, /consult, /team, /account, /stylist, /admin
  components/     Shared UI + role-specific components (PushToggle, NotificationPreferences, ...)
  db/             Drizzle schema + client
  lib/
    actions/      Server Actions — one file per domain
    auth/         Session + password handling
    crm.ts        Phone normalization, client matching, privacy scoping
    eligibility.ts  Server-side professional↔service eligibility (new this pass)
    payments/     Payment provider abstraction
    rate-limit.ts   In-memory rate limiter (new this pass)
    reminders.ts    Scheduled reminder logic (new this pass)
    data/         Read-only query helpers
scripts/
  seed.ts                          V1 pricing + demo accounts (dev only)
  seed-natural-hair-services.ts    Idempotent — safe against production
  seed-makeup-services.ts          Idempotent — safe against production
tests/
  *.test.ts        77 automated tests — see "Automated tests" above
  helpers.ts       Real-JWT sign-in helper + test user factory
  global-setup.ts  Pushes the real schema into data/test.db once per run
```

## Deployment

1. `npm run build`
2. Provide `SESSION_SECRET` at minimum; add MTN MoMo, VAPID, and
   `CRON_SECRET` variables to enable those features (see `.env.example`)
3. Configure your scheduler to hit `/api/cron/reminders` (see above)
4. Persist `data/hairtopia.db`, `public/uploads/`, and `private-uploads/`
   on a volume that survives deploys
5. Ensure outbound HTTPS is permitted if enabling Web Push (to reach
   FCM/Mozilla's push services) or MTN MoMo's API

For anything beyond a single small server: migrate to Postgres and
S3/Cloudinary for uploads, and replace the in-memory rate limiter with a
shared store, as noted above.

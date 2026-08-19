# Hairtopia Studio — Salon OS

Built by **Coratech AI** for Hairtopia Studio (266 Afro Osro Street).

A full-stack salon management platform: customer booking, walk-in/QR queue,
stylist mobile workflow, attendance with geofenced check-in, completed-work
verification, reviews, payments bookkeeping, staff management, reporting,
and an owner-only audit log.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** — custom design tokens matching the Hairtopia brand
- **Drizzle ORM + SQLite** (via `better-sqlite3`) for local development.
  The schema is written in a way that maps cleanly onto Postgres if you want
  to move to Neon/Supabase later — see "Moving to Postgres" below.
- **Custom JWT session auth** (via `jose`) with httpOnly cookies and
  bcrypt password hashing — no third-party auth dependency
- Server Actions for all mutations (booking, attendance, staff, payments,
  reviews, settings, audit logging)

## Getting started

```bash
npm install
npm run db:push     # creates data/hairtopia.db from the schema
npm run db:seed     # seeds real Hairtopia pricing + demo accounts
npm run dev          # http://localhost:3000
```

> **Note:** `.npmrc` sets `ignore-scripts=true`. This is intentional —
> `better-sqlite3` ships precompiled binaries for every platform and doesn't
> need its install script to run, so skipping it avoids an unnecessary native
> compilation step on machines or networks that don't allow it. If you add a
> different native-dependency package later, run `npm rebuild <package>` for
> that one package specifically.

### Demo accounts (local dev only — clearly fictional data)

| Role     | Phone       | Password    |
|----------|-------------|-------------|
| Owner    | 0240000001  | owner123    |
| Manager  | 0240000002  | manager123  |
| Stylist  | 0240000003  | stylist123  |
| Customer | 0240000006  | customer123 |

**Change these before going live.** Owner and manager accounts should have
their passwords rotated from Admin → Staff, and the seed script should not
be re-run against a production database.

## What's real vs. what needs your credentials

Everything in this codebase is fully implemented and runs end-to-end
locally: booking with conflict prevention, RBAC, attendance geofencing,
completed-work review, cancellations, no-shows, queue management, audit
logging, reports, and settings — nothing is mocked or faked.

Two things are architected but intentionally **not** wired to a live
third party, because that requires your own credentials:

- **Payments** — the full data model (`payments` table, appointment
  `paymentStatus`, deposit settings) is built and the admin can record
  cash/momo/card/transfer payments today. Wiring a live Paystack charge
  requires your Paystack secret key — see `src/lib/actions/payments.ts`
  for where to add the API call.
- **SMS / WhatsApp notifications** — in-app notifications are fully live
  (`src/lib/notify.ts`). Plugging in an SMS or WhatsApp Cloud API provider
  is a small addition to that one file; call sites don't need to change.

## File uploads

Customer reference photos and stylist completed-work photos are stored
locally under `public/uploads` (see `src/app/api/upload/route.ts`). This
works out of the box with no external service. To move to Cloudinary or S3
later, only that one route needs to change.

## Moving to Postgres for production

The schema in `src/db/schema.ts` uses `drizzle-orm/sqlite-core`. To move to
Postgres:

1. Swap the schema's `sqlite-core` imports for `pg-core` equivalents
   (mostly a find/replace — the shape doesn't change).
2. Swap `src/db/index.ts` to use `drizzle-orm/node-postgres` (or your
   provider's driver) pointed at your `DATABASE_URL`.
3. Run `drizzle-kit push` against the new database.

## Project structure

```
src/
  app/            Route handlers — public site, /account, /stylist, /admin
  components/     Shared UI (ui/) and role-specific components
  db/             Drizzle schema + client
  lib/
    actions/      Server Actions — one file per domain (booking, attendance, staff, ...)
    auth/         Session + password handling
    data/         Read-only query helpers shared across pages
scripts/
  seed.ts         Seeds real Hairtopia pricing + demo accounts
```

## Build

```bash
npm run build   # verified clean: 0 TypeScript errors, 0 lint errors
npm start
```

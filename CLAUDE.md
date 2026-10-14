# CLAUDE.md — UseHourly (formerly Hourly)

Time tracking for freelancers. The product name is **UseHourly** (renamed from "Hourly" 2026-10-14 to stay clear of other products called Hourly). Only what people see changed: internal ids are kept on purpose (Worker `hourly`, D1 `hourly-db`, the `hourly:lastProject` saved setting, `hourly_rate` fields). The GitHub repo is `Zontak-LLC/usehourly` and the local folder is `~/Projects/usehourly` (both renamed from `hourly` on 2026-10-14; the old repo URL redirects); download file names are `usehourly-*.xlsx`. Goal: logging a day's time should take seconds (UX is the product).
Built on the `arhamkhnz/next-shadcn-admin-dashboard` shell (the Vercel "admin-dashboard" template was Postgres/Auth.js-only, so it was not used). No Material UI — shadcn + Tailwind only.

## Stack
Next.js 16, React 19, Tailwind v4, shadcn/ui · NextAuth v5 (Credentials, JWT) · tRPC v11 · Prisma 7 + Cloudflare D1 · Vitest · Biome · OpenNext on Cloudflare Workers. Dev port **3028**.

## Commands
```bash
npm run dev                 # http://localhost:3028 (local D1 via wrangler state)
npm run d1:migrate:local    # apply migrations/ to local D1 (do this first)
npx vitest run              # scenario tests (src/__tests__)
npx next build              # must pass before deploy
npm run deploy              # opennextjs-cloudflare build + deploy
npm run d1:migrate:remote
```
Live at **https://usehourly.app** (Worker `hourly`, Cloudflare account Zontak LLC, custom domain attached in `wrangler.jsonc` `routes`); the old `hourly.dzontak.workers.dev` still answers. `wrangler.jsonc` pins `account_id` because the shared token sees more than one account. `NEXT_PUBLIC_APP_URL` is baked at build time, so `npm run deploy` sets it on the build command.
Secrets: `AUTH_SECRET`, `AUTH_URL` in `.env.local` and `.dev.vars` (keep in sync); production secret via `wrangler secret put AUTH_SECRET`.

## Design decisions
- Duration is integer **minutes**; `TimeEntry.date` is a local `YYYY-MM-DD` string (Workers run in UTC — "today" is computed in the browser, never on the server).
- `src/lib/duration.ts` parses `1.5`, `1:30`, `90m`, `2h`, `1h30`; bare number ≤12 = hours, else minutes. Shared by client preview and server validation.
- Running timer = a `TimeEntry` with `started_at` set. `entry.start` stops any running timer first; stop rounds elapsed up to ≥1 min.
- Multi-tenancy = per-user: every procedure uses `protectedProcedure` and filters by `ctx.userId` (that filter is the isolation boundary).
- tRPC router for clients is named `clients` (a router named `client` collides with tRPC's built-in).
- `getPrisma()` is lazy on purpose — a top-level await on D1 breaks `next build` with SQLITE_BUSY.
- `trpc.ts` must not import next-auth/Prisma at runtime (context lives in `context.ts`) so routers are testable.
- Sidebar user name is read from the DB in the dashboard layout, not the JWT (JWT goes stale after profile edits).

## Routes
`/dashboard/today` (quick-add, timer, day list; `?date=`) · `/dashboard/week` (editable timesheet grid + multi-day Fill + Excel export; `?project=`) · `/dashboard/month` (calendar of day/week totals, per-project breakdown, Excel export; `?month=YYYY-MM&project=`) · `/dashboard/report` (annual summary for taxes: hours, earned, quarters, months, clients/projects, invoices; Excel export; `lib/annual-report.ts`) · `/dashboard/invoices` (searchable history; PDF re-download) · `/dashboard/invoices/new` · `/dashboard/clients` · `/dashboard/account` · `/auth/v2/login|register`. `src/proxy.ts` redirects signed-out users to login.

## Landing page and brand
- `/` is a public landing page (`src/app/(main)/page.tsx`); signed-in users are sent on to `/dashboard/today`. The rule lives in `src/lib/route-access.ts` (tested) and is applied by `src/proxy.ts`; `next.config.mjs` must NOT redirect `/` (it used to, and hid the page).
- Its screenshots (`public/landing/*.webp`) are the real app, taken from a local demo freelancer: register through the UI, seed clients/projects/entries/invoices with `wrangler d1 execute --local`, screenshot Today/Week/Month/Report at 1440x900 @2x with the Next dev badge hidden, then delete the demo rows.
- Logo: an "H" inside a stopwatch with an amber crossbar. `src/components/logo.tsx` (`LogoMark`, `Logo`) and `src/app/icon.svg` must stay in step; `apple-icon.png`, `favicon.ico`, `opengraph-image.png` and `twitter-image.png` are rendered from it. Public pages (sitemap, robots) are only `/` and the two `/auth/v2/*` pages.

## Free, supported by donations
- Hourly is free: no paywall, no ads, and no payment code anywhere. Donations are optional.
- The donation address is one constant, `DONATE_URL` in `src/lib/donate.ts` (`donateUrl()` only accepts https). It is **on**: https://github.com/sponsors/Zontak-LLC (the Zontak LLC GitHub Sponsors listing, live 2026-10-14; one-time, monthly and custom amounts). It drives the landing page "Hourly is free." band and footer link and the Account page "Support Hourly" card (`SupportHourly`). Set it to "" to hide all of them.
- GitHub Sponsors is meant for open-source work and the Hourly repo is private; if GitHub ever objects, Ko-fi or Buy Me a Coffee are drop-in replacements (change `DONATE_URL` and `DONATE_PLATFORM`).

## Timesheet grid & export
- Every entry row (Today page and the day-editor dialog) has a Move control (`move-popover.tsx`): quick picks around its day or any date; it calls `entry.update({ id, date })` and changes nothing else.
- Week/Month have a project filter (`src/components/project-filter.tsx`, `?project=<id>`): client-side filter of the already-loaded entries; export respects it. On Today, the project label on each entry is an invisible `<select>` that reassigns via `entry.update` in one step.
- `entry.bulkSet` is the single write path for grid cell edits and multi-day fill: >0 creates/updates the day's single entry, 0 deletes it; days with several entries or a running timer are **skipped and reported**, never merged (those cells render read-only and link to the day).
- Several entries on one day: each weekday header on Week has a **+** (`week/_components/add-entry-popover.tsx`): pick project (preset to the row you last typed in, filled or annotated; else the project filter; else the first row), hours, note, Enter; it calls `entry.create` and stays open so a day can be keyed in a row, listing what the day already holds. Cells stay one value per project × day (multi-entry days remain read-only, linking to the day editor).
- `src/lib/timesheet.ts` (`buildSheet`) pivots entries into project × day; Week, Month and the export all use it.
- **Custom date range export** ("March 3 to April 20"): the **Date range…** button on Week and Month (`src/components/range-export.tsx`) opens a popover with From/To, quick picks (this month, last month, this quarter, last 30 days, year to date, last year) and a project select; it fetches `entry.list({from,to})` and calls `downloadTimesheetXlsx({ range: true })`. The rules (max 366 days, presets, file name, plain-words messages) are pure functions in `src/lib/export-range.ts`. With `range: true` the grid headers carry the month ("Tue, Mar 3", so Mar 3 and Apr 3 are never confused) and a range with more than 62 worked days switches to one column per Monday-start week ("Week of Mar 2"). Without `range` the Week/Month export is unchanged.
- **Export everything** (all clients, all time, one zip): `src/components/export-everything.tsx`, on the Account page ("Your data") and in the date-range popover. `src/lib/export-all.ts` `planExport` builds `README.txt`, `all-time.xlsx`, `all-entries.csv` (UTF-8 BOM, RFC 4180 quoting), `invoices.csv` (only when there are invoices; the 200 most recent, the router's cap) and `by-client/<Client>.xlsx`; JSZip is imported on demand. Zero-minute entries (a timer just started) are left out everywhere. Tests: `export-range.test.ts` (writes real xlsx and zip bytes and reads them back).
- Excel export is client-side (`src/lib/export-xlsx.ts`, exceljs imported on demand): sheet "Timesheet" = decimal-hour grid with live SUM formulas; sheet "Entries" = per-entry rows with rate/amount. `buildTimesheetWorkbook` is tested by round-tripping the real bytes.
- exceljs still lands in the Worker bundle (~0.25 MB gzip of ~5.4 MB; paid-plan limit is 10 MB). Slim later if the Worker nears the limit.
- Local D1 state can get wiped by `npm run deploy`; re-run `npm run d1:migrate:local` and re-register a dev user if login says Configuration error.

## Logos
- Users, clients and projects can each have a logo stored as a small png/jpeg data URL (`logoSchema`, resized in the browser by `src/lib/logo.ts`; projects at 160×160). They are **never** included in entry/client lists (`omit: { logo: true }`, see `withProject` in `entry.ts`): project logos come from the single cached `project.logos` query (`src/components/project-logo.tsx`: `useProjectLogos` + `ProjectMark`, which falls back to the client's color dot); client logos from `clients.get`.

## Invoices
- `invoice.create` recomputes everything server-side from billable entries (client's projects, date range) using `src/lib/invoice.ts` `buildInvoice` — the builder page runs the same function only for the live preview. One line per project; amount = round(minutes × rate / 60) per line, in cents.
- Each `Invoice` stores a frozen JSON `snapshot` (seller name/EIN/address/logo, lines, detail) so history never changes when rates, entries or the account are edited later; the PDF is re-rendered from it (`src/lib/invoice-pdf.ts`, jsPDF + autotable, client-side, dynamic import). `search_text` is a lowercase blob (number, client, projects, entry notes, total) that `invoice.list({q})` matches with `contains`.
- Business details live on `AuthUser` (`business_name`, `ein` normalized NN-NNNNNNN, `address`, `logo` = ≤400 KB png/jpeg data URL, resized in the browser on the Account page). Invoice numbers `INV-<year>-NNN`, unique per user. Clients also carry `legal_name` (full name, falls back to `name`), `address` and `logo`, edited via "Billing details" on Clients & projects; `clients.list` omits `logo` (hundreds of KB) — use `clients.get`. PDF header: left = your logo/name + INVOICE + number/dates, right = client logo, full name, address. Invoices carry `paid_date` (a date, not a flag — cash-basis taxes need *when*); it lives outside the frozen snapshot. `invoice.markPaid`, status filter on history; the annual report's cash view (Received by paid date, Outstanding at year end) comes from it.

## Deployment
Live: https://hourly.dzontak.workers.dev (Worker `hourly`, D1 `hourly-db` id `fd20fd46-8c42-4ee0-8697-118358734897`, deployed 2026-10-09). `AUTH_SECRET` is a Worker secret (set via `wrangler secret put`, different from the local `.dev.vars` value); `AUTH_URL`/`NEXT_PUBLIC_APP_URL` are `vars` in wrangler.jsonc. Registration is open to anyone. esbuild "duplicate key providers" warnings during build are benign.

## Not yet built
A standalone CSV export per week/month (CSV exists only inside the export-everything zip), a printable timesheet PDF for client sign-off, password reset email, rate limiting on login/register (see duely's `rate-limit.ts`).

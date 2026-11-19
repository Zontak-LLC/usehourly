# Operating UseHourly

How to see whether the app is healthy, find out why something failed, ship a change and go back when a
change goes wrong. Written for the next person on call, including future you.

## Where it runs

| Piece | What | Where to look |
|---|---|---|
| App | One Cloudflare Worker named `hourly` (Next.js through OpenNext) | Cloudflare dashboard > Workers & Pages > `hourly` |
| Database | Cloudflare D1 `hourly-db` (SQLite) | `npx wrangler d1 ...`; Time Travel keeps 30 days |
| Public address | https://usehourly.app (custom domain, the only public origin) | `wrangler.jsonc` `routes` |
| Pipeline | GitHub Actions `ci.yml`: `check`, `e2e` (4 shards), then `deploy` (with the smoke test) on `main` | https://github.com/Zontak-LLC/usehourly/actions (free: the repository is public) |
| Secrets | Worker secrets (`AUTH_SECRET`, `RESEND_API_KEY`, `ADMIN_EMAILS`, `TURNSTILE_SECRET_KEY`, OAuth ids/secrets, ...) | `npx wrangler secret list` (names only) |

## CI cost (2026-11-16)

CI runs on GitHub Actions' standard runners, which are free and unlimited for a public repository. CircleCI was used
until 2026-11 and was dropped because its credits cost money. Test reports are kept only when a run fails, for 14 days.

## Read-only tokens for Claude (2026-10-23, issue #199)

Claude reads CI results, logs and delivery status from the command line with **limited, revocable tokens** that the
owner makes and keeps in shell environment variables. There is no shared "Claude" account. Production changes still
need the owner's go every time.

| Variable | Service | Scope | Make it at | Revoke it at |
|---|---|---|---|---|
| `CLOUDFLARE_READ_TOKEN` | Cloudflare | Account: Workers Scripts **Read**, D1 **Read**, Workers Tail **Read**, Account Analytics **Read**; only the Zontak LLC account | https://dash.cloudflare.com/profile/api-tokens > Create Token > Custom token | The same page, ··· > Delete |
| `RESEND_READ_TOKEN` | Resend | Only if Resend offers a read-only key; its keys are "Full access" or "Sending access", so skip it until it does | https://resend.com/api-keys | The same page |
| (none) | GitHub | The `gh` login already in use (CI runs and logs too) | | `gh auth logout` |

Rules: the smallest scope that does the job; never paste a token into a chat, an issue or a file in this repository
(they live in `~/.zshrc` or a password manager's shell integration); rotate a token whenever it may have been seen.
The deploy token stays only in the GitHub Environment `production` (deployment branches: `main`).

**Reading a CI run.** `gh` reads everything, no extra token:

```bash
gh run list --workflow ci.yml --branch main --limit 5   # newest first
gh run view <run-id>                                     # jobs and their status
gh run view <run-id> --log-failed                        # only the failed steps' logs
gh run download <run-id> -n e2e-report-1                 # a shard's report (kept only when it failed)
```

## Is it healthy?

- `GET https://usehourly.app/api/health` answers `{"ok":true}` with 200 when the database answers `SELECT 1`, and 503
  when it does not. Point an uptime monitor at it (and at `https://usehourly.app/api/mcp`, which answers 405 to a GET:
  anything but a timeout means it is up). A monitor should alert a phone, not just an inbox.
- A 200 also says how long the database took: `{"ok":true,"db":{"selectMs":4,"probeMs":6}}` (`SELECT 1`, then one
  indexed read that touches no one's data). Night Watch's Database monitor compares them with their own 7-day normal.
  Its limits live in Night Watch, not here. Staging's probe sits near 50 ms since 2026-10-27 with no errors: see
  `docs/incidents/2026-10-27-staging-database-probe.md` (no app change; the fix is a Night Watch ticket).
- After every deploy the `deploy` job waits for the health endpoint and runs the smoke test (below). To check by hand: `curl -s -o /dev/null -w "%{http_code}\n" https://usehourly.app/api/health`.

## Reading the logs

Logs are one JSON object per line (`src/lib/log.ts`): `level`, `event`, `time`, extra fields, and for errors an
`error` object with `name`, `message` and a shortened `stack`. Secrets are redacted by key name. `requestId` is
Cloudflare's `cf-ray`, so one request can be followed across lines. Nothing in a log line should be personal data;
if you find some, that is a bug.

- **Search after the fact:** Cloudflare dashboard > Workers & Pages > `hourly` > Logs (Workers Logs, switched on by
  `observability` in the Wrangler config). Filter on `event`, `level` or `requestId`.
- **Watch live:** `npx wrangler tail hourly --format json --status error`, or add `--search invoice_email_failed`.

Events you may see (all `level: "error"`), and what they mean:

| `event` | Meaning | What to do |
|---|---|---|
| `trpc_internal_error` | A tRPC call failed with an unexpected error (`path`, `requestId`) | Find the `requestId`, read the `error`; reproduce with the path's scenario test |
| `render_error` | A server render (page, layout or server component) threw (`path` without query, `routePath`, `routeType`, `digest`, `requestId`) | Find the `requestId`/`digest`, read `error.message`, and open the follow-up fix ticket from that path with a failing test first |
| `health_check_failed` | The database did not answer | Check Cloudflare status; D1 dashboard |
| `support_notice_read_failed` | The "chip in" setting could not be read (the layout shows no note instead of failing) | Usually migration 0033 not applied yet: run `npm run d1:migrate:remote` |
| `invoice_email_failed`, `report_email_failed`, `approval_email_failed`, `verification_email_failed`, `password_reset_email_failed` | The email service refused or was unreachable; the user action itself still worked | Check Resend status and the API key; users can retry |
| `weekly_reminder_failed`, `invoice_reminder_failed` | One reminder in the hourly cron failed; it is retried the next hour where that is safe | Look for a pattern (one bad address vs all) |
| `housekeeping_sweep_failed` | The hourly clean-up of spent rate limits, email links and OAuth codes failed | Harmless for a while; fix before tables grow |
| `invoice_undo_failed` | Saving an invoice failed while marking its time, and undoing it failed too (`userId`, `invoiceId`): a half-saved invoice may be left, with some of its hours still shown as not invoiced | Check D1 status; once it answers, find the invoice by `invoiceId` and delete it on the Invoices screen, so its hours are not billed twice |
| `invoice_logo_cleanup_failed` | A leftover logo row after deleting an invoice | Harmless |
| `usage_count_failed` (warn) | One page view was not counted (two first views of a day raced, or the database was busy) | Harmless; a steady stream means the usage table needs a look |
| `mcp_internal_error`, `mcp_tool_error`, `mcp_last_used_update_failed` | A failure inside the MCP endpoint | Same as tRPC; the caller got a plain "try again" |
| `social_sign_in_failed`, `demo_sign_in_failed` | A GitHub/Google or sample-account sign-in failed | Check the provider's status and the secrets |
| `prisma_warmup_failed` | The early connection attempt failed; it reconnects on the first query | Only matters if it repeats |
| `d1_retry` (warn) | A read failed with a short-lived D1 error ("Network connection lost" and similar) and is tried again (`attempt` 1 or 2, `message`); the adapter's own "Error in performIO: %O" line comes with it | Harmless alone; many in a row mean D1 itself is in trouble (Cloudflare status, D1 metrics) |
| `drill_started`, `drill_stopped`, `drill_expired` (warn) | STAGING only: a planned test failure began, was stopped or ran out (`fault`, `expires`) | Nothing: errors between started and stopped/expired are the drill (see "Drills") |
| `drill_refused` (warn) | STAGING only: a call to `/api/drill` with a wrong or missing token | One is a typo; many is someone guessing (20 per 15 minutes per connection) |
| `drill_read_failed` | STAGING only: the drill setting could not be read; the path runs normally | Harmless |

### Known log noise

Lines that are not ours and need no fix. Match the whole signature, not one frame.

**Stale Server Action after a deploy** (incidents `usehourly:b9180f8241326666`, 2026-10-25, and
`usehourly-staging:b9180f8241326666`, 2026-11-05)

- Sites: production and staging. The same signature appears on staging (`hourly-staging`,
  https://staging.usehourly.app) after each staging deploy. Frame line numbers change between builds (e.g.
  custom-worker.js:59701 vs 59740, `n2` at 71908 vs 71923); the frame names stay.
- Signature: a multi-line `warn` whose frames are `at Object.get` (custom-worker.js), then `rD`, `r$`, `sg`, `sy`,
  `n2`, `p2`, `o8.handleResponse`, `v2`. Line numbers change with each deploy; the frame names stay.
- Warning text (the first line, which Night Watch does not capture):
  `Error: Failed to find Server Action "<id>". This request might be from an older or newer deployment.`
  Its rarer twin, for a malformed id: `The Server Reference ID did not match the expected format.`
- Source: Next.js 16.4.2, `createServerModuleMap()` in `next/dist/server/app-render/manifests-singleton.js` (the
  `Object.get` is its Proxy getter). `handleAction` (`r$`) catches the error, writes it with `console.warn` and answers
  404 with `x-nextjs-action-not-found: 1`; the browser then reloads the page.
- Why: a tab opened before a deploy still holds the old action ids and posts one after the new Worker is live. Each
  click or retry in that tab writes one line, so a few lines within seconds of each other are normal.
- Upstream: https://nextjs.org/docs/messages/failed-to-find-server-action (Next's own page for this message).
- Night Watch triage: close as known noise. Do look further when the lines come with no deploy in the hour before, or
  in a steady stream from many `requestId`s: that is someone posting made-up action ids.

**Bot form post to a page** (incident `usehourly:9bef45d27c59b510`, 2026-11-03 to 2026-11-12)

- Signature: a multi-line `warn` whose first frame is anonymous (`at custom-worker.js:<line>:46`), then `r$`, `sg`,
  `n2`, `p2`, `o8.handleResponse`, `v2`. No `Object.get` or `rD` (that is the stale-action entry above).
- Warning text (the first line, which Night Watch does not capture): `Error: Invalid Server Actions request.`
- Source: Next.js 16.4.2, `next/dist/server/app-render/action-handler.js` (`handleAction`, `r$`): a
  `multipart/form-data` POST to a page with no `next-action` header. Next writes it with `console.warn` and answers
  400 with `x-nextjs-action-not-found: 1`. No screen of the app sends one; bots and scanners do.
- Fixed: `src/proxy.ts` now refuses these with 400 `Bad request` before Next runs (`isStrayFormPost` in
  `src/lib/route-access.ts`; test `e2e/stray-form-post.spec.ts`). A new line with this signature means the guard was
  bypassed: look again, do not close as noise.

## Shipping a change

Pushing to `main` is the release: GitHub Actions (`ci.yml`) runs `npm run ci` (Biome, types, tests with the coverage
floor) and the browser tests (4 shards), applies D1 migrations (`wrangler d1 migrations apply DB --remote`), deploys,
then smoke-tests the live site. Pull requests run the same checks and browser tests, without the deploy. Run
`npm run ci` before every push. Other workflows: a weekly dependency audit and CodeQL, and a nightly browser-test run
(`e2e.yml`: every spec on the phone too, plus the "every control" sweep). That run prints its 10 slowest tests in its log (step "Slowest 10 tests") and keeps
`summary.md` in the `e2e-report` artifact.

## Staging and daily releases (2026-10-21)

**Staging** is a second copy of the site at https://staging.usehourly.app: its own Worker `hourly-staging`, its own D1 database `hourly-staging-db`, its own `AUTH_SECRET`, no cron, and none of the email, robot-check, Google or GitHub settings (so it cannot send mail and cannot sign in with them). It shows a yellow "Staging copy" banner and answers `X-Robots-Tag: noindex`. It holds test data only.
- **Set up once:** `npx wrangler d1 create hourly-staging-db`, copy `wrangler.staging.example.jsonc` to `wrangler.staging.jsonc` (git-ignored) with the real ids, `npm run staging:migrate`, `npm run staging:deploy`, then `openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET --config wrangler.staging.jsonc`.
- **Deploy a build:** `npm run staging:migrate` (migrations run here first, so a bad one shows up before production), then `npm run staging:deploy`, then `npm run staging:smoke`. `scripts/staging-deploy.mjs` builds with `.env.local`, `.dev.vars` and the other env files moved aside, because the build copies their values INTO the bundle, and refuses to deploy if any secret value is found in the server bundle. (This was found on the first deploy, which had carried the real email key; it was replaced within the hour. Never build staging with a plain `opennextjs-cloudflare build`.)
- **Test against it:** `E2E_BASE_URL=https://staging.usehourly.app npx playwright test <files>` (sign-up is limited to 5 per hour per connection, so run a few files at a time; tests that read mail from the stand-in mailbox cannot run there). The full suite runs on the release pull request in GitHub.
- Not yet: a Cloudflare Access lock in front of it (dashboard: Zero Trust, Access, Applications), and deploying it from CI.

**Daily release** (when the owner says "daily release"): tickets merge into the `next` branch one after another (each cut from `next`, `npm run ci`, targeted e2e, cold review, approval of the before/after page). Deploy `next` to staging and look at it. On "ship": one pull request `next` to `main`, full CI and e2e green, record the rollback points first (`wrangler deployments list` for the current Worker version id, and for a migration the D1 Time Travel timestamp), merge, watch the `deploy` job (`gh run watch`), confirm `/api/health`, check the Worker logs for new errors for 15 minutes, and list what went out. If health fails or errors spike, roll back first (`wrangler rollback <version-id>`), investigate after. At most one high-risk ticket (migration, sign-in or security, money, email sending) per release, built first. New features that need outside setup ship hidden behind a setting, like the Google Calendar button.

## Drills: break one thing on purpose, on staging (2026-10-24)

To see Night Watch catch and triage a real failure, staging can break ONE path for a few minutes (`src/lib/drill.ts`, route `/api/drill`).
- **Faults:** `health-503` (`/api/health` answers 503 and logs `health_check_failed`), `health-slow` (`/api/health` answers after 6 s; Night Watch calls over 5 s slow), `entry-list-500` (`entry.list` fails, so Today, Week and Month cannot load entries, and tRPC logs `trpc_internal_error` with `path: entry.list`). Nothing else is touched: no sign-in, money, email or data.
- **Off by default and impossible on production:** the route answers 404 unless the build is the staging build (`NEXT_PUBLIC_APP_ENV=staging`, set only by `npm run staging:deploy`), the address is not usehourly.app, AND the Worker secret `DRILL_TOKEN` (32+ characters) is set. On production the faulted paths do no extra database read.
- **A drilled health 503 says so:** it carries the header `X-Drill: health-503` (the body stays `{"ok":false}`), so triage can tell it from a real outage (`curl -i https://staging.usehourly.app/api/health`). A real database failure has no such header.
- **Always ends:** 10 minutes by default, 15 at most; `stop` ends it at once. The drill is one row in `app_settings` (key `drill`) so every isolate sees it within 5 seconds.
- **Run one:** `node scripts/drill.mjs status`, `node scripts/drill.mjs start health-503 5`, `node scripts/drill.mjs stop` (token from the Keychain item `usehourly-staging-drill-token`).
- **Set up once (owner):** `openssl rand -hex 24 | pbcopy && ~/.claude/bin/secret-save usehourly-staging-drill-token`, then `~/.claude/bin/secret-get usehourly-staging-drill-token | npx wrangler secret put DRILL_TOKEN --config wrangler.staging.jsonc`. To switch drills off for good: `npx wrangler secret delete DRILL_TOKEN --config wrangler.staging.jsonc`.
- Night Watch watches production (site `hourly`, usehourly.app) and staging (site `usehourly-staging`: Worker `hourly-staging` logs, https://staging.usehourly.app/ and https://staging.usehourly.app/api/health). Staging incidents are labelled "UseHourly staging", so a drill never pages as production. Night Watch does not close log incidents by itself; after a fix (or after the drill ends), press Resolve on its board.

## Performance Check: a load test on staging (2026-10-25, issue 311)

One command drives real browsers as stress-test accounts on staging and writes a report of what happened (spec: `docs/specs/performance-check.md`).
- **Run it:** `npm run perf-check -- --users=10,25,50 --minutes=3`. It refuses any address but https://staging.usehourly.app. Each step adds people over 10 seconds; they sign in (4 light, 4 regular, 2 heavy in every 10, the same accounts every run) and go round Today, Log time, the previous day, search, Week and its CSV export, Month, Invoices, Clients and the Year summary, with 1 to 3 seconds between actions; regular and heavy people also make one invoice per step. Steps are 70 seconds apart so Cloudflare's per-minute figures never mix two.
- **What it measures:** per action the page data time (first to last tRPC request the action made, from the browser), the whole action time, server errors (5xx or no answer), browser console errors and failed actions; requests per second; then, about 2 minutes after the run, D1 rows read and written and Worker requests and CPU time for each step from Cloudflare's GraphQL analytics (token: `CLOUDFLARE_READ_TOKEN`, then the Keychain item `cloudflare-loader-logs-token`, then `CLOUDFLARE_API_TOKEN`; else `wrangler d1 insights`; else "not measured"). The cost is worked out from Cloudflare's published prices (`PRICES` in `scripts/perf/stats.mjs`).
- **It never crashes:** every action's error or timeout is recorded (when, step, action, page, person, how long, timeout or error) and the person carries on; anything that escapes is written down and the run goes on; the report is ALWAYS written, also on Ctrl-C (partial results, marked as not finished).
- **Server errors in detail:** each 5xx or unanswered request is listed with its procedure(s), status, tRPC code, the start of what the server said, and its `cf-ray` (find it with `npx wrangler tail --config wrangler.staging.jsonc --format json --status error` during the run).
- **Test machine or server?** Per step it records this Mac's load (1-minute average, every 5 s, against its cores) and Node's event-loop lag, and per request the time to first byte (and a Server-Timing total when the app sends one). If page times grow while the server wait stays flat, or the load passes the cores, the slowness is on the test machine; the summary says so.
- **Output:** `.perf/runs/<time>.json` and one self-contained `.perf/runs/<time>.html` (git-ignored), compared with the previous run in that folder. The page follows the private-artifact rules, so it can be published as is.
- **The swarm pass:** without it the normal limits apply and more than about 40 sign-ins in 15 minutes from one machine are refused. With the staging Worker secret `SWARM_TOKEN` (32+ characters) and the same value sent as `x-swarm-token` (from `SWARM_TOKEN` here or the Keychain item `usehourly-staging-swarm-token`, only on `/api/*`), accounts ending `@stress.invalid` skip the per-account tRPC write limit and the login throttle. Same gate as the drill switch: never on the production build or address.
- **Set up once (owner):** `openssl rand -hex 24 | pbcopy`, then `~/.claude/bin/secret-save usehourly-staging-swarm-token`, then `~/.claude/bin/secret-get usehourly-staging-swarm-token | npx wrangler secret put SWARM_TOKEN --config wrangler.staging.jsonc`. To switch it off: `npx wrangler secret delete SWARM_TOKEN --config wrangler.staging.jsonc`.
- Each run adds a few 15-minute "perf check" entries and some invoices to the stress accounts (staging test data). 50 people means 50 browser tabs on this machine: close other heavy work first.

## After a deploy: the smoke test and automatic rollback (2026-10-22)
- **What runs:** the `deploy` job in `ci.yml`, after the deploy on `main`. It waits for `/api/health`, then runs `e2e/smoke/production.spec.ts` in a real browser (desktop and phone) against the live site: the public pages and the health check, then a throwaway **sample account** (the app deletes it within 24 hours): Today, add an entry, edit it, delete it (the question opens in its card), Week, Month (a day opens as a card), Invoices, Clients, Year summary. An uncaught error, a console error or an HTTP 5xx anywhere fails it. It touches nobody's data.
- **If it fails** (the spec retries once, so two failures), and the `production` environment variable `SMOKE_ROLLBACK` is `1` (switched on after the job has passed once on a real deploy): `scripts/rollback-previous.mjs` puts the Worker back on the version that was live before this deploy (`wrangler rollback`), the job checks `/api/health` again and **stays red** so it is noticed. The database is not touched: migrations must be additive (expand, then remove later), so the old code runs on the new schema. A sample-account limit (5 an hour per connection) skips the test instead of failing it, because that says nothing about the deploy.
- **By hand:** `npm run smoke:prod` runs the same test against production; `node scripts/rollback-previous.mjs --dry-run` shows which version a rollback would go to. A rollback leaves the Worker on the older version until the next deploy to `main`.
- **Adding to it:** keep it short (a few minutes) and read-only for real users; anything it needs must work with a sample account. When a screen it clicks changes, update the spec in the same pull request (a stale smoke test would roll back a good deploy).

## Going back when a deploy goes wrong

There are two separate things to undo, and they undo differently.

### 1. The code (fast: seconds)

```bash
# Versions that have been live, newest last:
npx wrangler deployments list --name hourly

# Put an earlier version back (no build, no CI). Use the Version ID from the list:
npx wrangler rollback <version-id> --name hourly --message "why"
```

Then fix forward: `git revert <bad commit>` and push, so `main` and production agree again. A rollback done with
Wrangler is undone by the next successful deploy from `main`, so revert before pushing anything else.

### 2. The database (slow, and it loses data written since)

Rolling the code back does **not** roll the database back. That is why migrations follow one rule:

> **A migration must work with both the old and the new code.** Add a column that is nullable or has a default; add a
> table; add an index. Never drop or rename something in the same release that stops using it. Remove it in a later
> release, once the old code can no longer be rolled back to.

Following the rule, a code rollback is always safe and the database never needs touching. If data itself is damaged:

```bash
npx wrangler d1 time-travel info hourly-db          # shows the restorable window (30 days)
npx wrangler d1 export hourly-db --remote --output=backups/before-restore.sql   # keep what exists now first
npx wrangler d1 time-travel restore hourly-db --timestamp=<ISO time>            # overwrites live data
```

`npm run d1:backup` writes a full SQL dump to `backups/` (git-ignored: it holds everyone's data).

### Rehearsal status

The `wrangler deployments list` and `wrangler rollback --help` commands were run on 2026-10-18 and work with this
account. **A rollback has not been rehearsed on production**, because there is no staging Worker and the live site
has real users. Rehearse it once during a quiet moment: note the current Version ID, roll back to the previous one,
check `/api/health` and a sign-in, then deploy `main` again and record the time it took here.

## If something is on fire

1. Is it the app (`/api/health` not 200)? Check Cloudflare's status page and the D1 dashboard first.
2. Did a deploy just happen? If yes and it looks related, roll the code back (above) and investigate afterwards.
3. Read the error logs for the last 15 minutes (`wrangler tail ... --status error`).
4. A leaked secret: rotate it first (`npx wrangler secret put NAME`), then investigate. Changing `AUTH_SECRET` signs
   everyone out and invalidates one-click email links, which is the correct outcome.
5. Write down what happened and the fix in the issue tracker.

## How the landing page `/` is served

`/` is a static file. Cloudflare Workers static assets serve `.open-next/assets/index.html` for `/` and apply
`.open-next/assets/_headers` before any Worker code runs, so a first visit never waits for an idle Worker to start.
Every other page still goes through the Worker and `src/proxy.ts` (per-request nonce CSP, sign-in check). So does an
unknown address: its 404 is `src/app/global-not-found.tsx` (`experimental.globalNotFound` in `next.config.mjs`), which
reads the proxy's nonce. `npm run build` fails if that 404 (`/_not-found`) or any page but `/` is built static.

- **The post-build step:** `npm run landing:static` (`scripts/landing-static.mjs`) runs right after
  `opennextjs-cloudflare build`. It copies the prerendered `.next/server/app/index.html` to `.open-next/assets/index.html`
  and adds a `/` rule to `.open-next/assets/_headers` (rules already in that file are kept). The rule holds a
  Content-Security-Policy that allows the page's inline scripts by their sha256 hash (the theme boot script, the JSON-LD
  and Next.js's own `self.__next_f.push` scripts; no nonce, no `'unsafe-inline'`), plus the same security headers
  `next.config.mjs` sets on every other page (HSTS, X-Frame-Options and the rest, X-Robots-Tag on staging). Both come
  from `src/lib/security-policy.mjs`. Each build (staging, production) computes its own hashes from its own HTML.
- **Its three callers:** `npm run deploy` (the GitHub Actions `deploy` job in `ci.yml`), `npm run preview` and
  `scripts/staging-deploy.mjs` (`npm run staging:deploy`). `src/__tests__/landing-static-callers.test.ts` fails if one of them loses the step.
- **When it fails the deploy:** the prerendered page is missing (`/` is no longer static), the page's canonical origin
  is not `NEXT_PUBLIC_APP_URL` (a page from the other build), an inline script's hash is not in the written `_headers`,
  `script-src` has `'unsafe-inline'`, the `/` rule is already there (run the build again first), or a `_headers` line is
  over Cloudflare's 2,000 characters. It never ships a page whose scripts the browser would block.
- **If the step is skipped** (for example `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy` by
  hand): no `index.html` ships, so the Worker serves `/` as before, but with no Content-Security-Policy at all, because
  the proxy no longer runs on `/`. The other security headers still come from `next.config.mjs`. Never deploy by hand.
- **Signed-in visitors:** the page's `SignedInRedirect` asks `/api/auth/session` after it paints and goes to
  `/dashboard/today` when there is a user. That call starts the Worker, but after the first paint. The service worker
  (`public/sw.js`) never caches `/`, so an old copy cannot stall the redirect.
- **Keep these Cloudflare features off for the zone:** Rocket Loader and Email Address Obfuscation. Both inject inline
  scripts that the hash policy blocks. Web Analytics is fine: its beacon is an external script from
  `static.cloudflareinsights.com`, which the policy allows.
- **Check it after a release:** leave staging idle for 15 minutes or more, then run
  `npm run measure:speed -- https://staging.usehourly.app`; the `/` row's "first" should be under 200 ms. Time the HTML response, not the redirect. `curl -sI https://usehourly.app/` should
  show the hash CSP (`'sha256-`, no `'unsafe-inline'` in `script-src`) with HSTS and X-Frame-Options.

## Why is a page slow?
D1 charges a network round trip for every query, so look at how many queries a page runs one after another, not at how
big they are.
1. `PRISMA_QUERY_LOG=1 npm run dev` prints a `QRY <ms> <sql>` line for every query (local only; never set it on the
   Worker). Load the page with an account that has a few thousand entries and count the lines.
2. In the browser's network tab a page should make ONE request to `/api/trpc/...` when it opens (`e2e/request-batches.spec.ts`
   checks this). A second request means a component asked for something late.
3. `npx wrangler d1 execute DB --local --command "EXPLAIN QUERY PLAN <sql>"` shows whether an index is used; the sums
   should say COVERING INDEX.
4. In production, Smart Placement runs the Worker next to the database; the Cloudflare dashboard's D1 metrics show query
   duration and rows read.

## Dependency audit policy

CI runs `npm run audit:prod` (`npm audit --omit=dev --audit-level=high`) weekly and on pull requests. It must pass.
Known and accepted on 2026-10-18:

- `uuid` < 11.1.1 (moderate) through `exceljs`. The advisory is about `v3`/`v5`/`v6` called with an output buffer;
  `exceljs` uses `uuid@8` `v4()` with no buffer, so it cannot be reached. Revisit when `exceljs` publishes a release
  that bumps it.
- Findings only in development tooling (the `shadcn` CLI, `glob`, `mysql2` inside the Prisma CLI) do not ship in the
  Worker; they are cleared by upgrading those tools when fixed versions appear (Dependabot opens the pull requests).

## Load check

`node scripts/load-check.mjs http://localhost:3029` hits the public pages and the health endpoint with a small amount
of concurrency and prints latency percentiles and error counts. It refuses to run against `usehourly.app` unless you
pass `--i-own-this-site`: do not load-test production without telling Cloudflare-side alerting first.

## Speed measure (production)

`npm run measure:speed` (`scripts/measure-speed.mjs`, no dependencies) shows how fast production answers. For
`/api/health`, `/auth/v2/login` and the landing page `/` it waits a pause, sends one first request, then a few more one
after another, and prints a table: endpoint, status, first, median and p90, in ms. The median and p90 cover only the
requests after the first. A time runs from sending the request to the end of the body. Redirects are not followed, so
a `307` (a bad or expired cookie on a signed-in page) shows in the status column. It exits 1 when a path got no answer
or a status of 500 and up.

```
npm run measure:speed -- [base url] [--runs=10] [--pause=10] [--path=/dashboard/today] [--cookie=USEHOURLY_COOKIE]
```

- The base URL defaults to `https://usehourly.app`; give a local or staging URL to measure that instead.
- `--runs` (1 to 50, default 10) requests per path after the first; `--pause` (0 to 120 s, default 10) before each path.
- `--path=` (repeatable) adds a path, for example a signed-in page.
- `--cookie=NAME` reads the Cookie header from the environment variable `NAME`. The value is never printed. To keep it
  out of shell history, copy the `Cookie` header of a signed-in request from the browser's network panel, then run
  `read -s USEHOURLY_COOKIE`, paste, press Enter, and `export USEHOURLY_COOKIE`.

It is safe on production: with the defaults it sends 33 GETs, one at a time, over about 35 seconds, and it never signs
in (it only GETs the login page, so it cannot trip the sign-in limit). "First" means the first request after a pause,
not a guaranteed cold Worker: Cloudflare may answer the landing page from its edge cache.

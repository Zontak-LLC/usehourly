# Operating UseHourly

How to see whether the app is healthy, find out why something failed, ship a change and go back when a
change goes wrong. Written for the next person on call, including future you.

## Where it runs

| Piece | What | Where to look |
|---|---|---|
| App | One Cloudflare Worker named `hourly` (Next.js through OpenNext) | Cloudflare dashboard > Workers & Pages > `hourly` |
| Database | Cloudflare D1 `hourly-db` (SQLite) | `npx wrangler d1 ...`; Time Travel keeps 30 days |
| Public address | https://usehourly.app (custom domain, the only public origin) | `wrangler.jsonc` `routes` |
| Pipeline | CircleCI: `check`, then `deploy` on `main` | CircleCI project `usehourly` |
| Secrets | Worker secrets (`AUTH_SECRET`, `RESEND_API_KEY`, `ADMIN_EMAILS`, `TURNSTILE_SECRET_KEY`, OAuth ids/secrets, ...) | `npx wrangler secret list` (names only) |

## Is it healthy?

- `GET https://usehourly.app/api/health` answers `{"ok":true}` with 200 when the database answers `SELECT 1`, and 503
  when it does not. Point an uptime monitor at it (and at `https://usehourly.app/api/mcp`, which answers 405 to a GET:
  anything but a timeout means it is up). A monitor should alert a phone, not just an inbox.
- After every deploy CircleCI's job finishes green only if the deploy command succeeded; it does not call the health
  endpoint. Check it yourself after a release: `curl -s -o /dev/null -w "%{http_code}\n" https://usehourly.app/api/health`.

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
| `health_check_failed` | The database did not answer | Check Cloudflare status; D1 dashboard |
| `invoice_email_failed`, `approval_email_failed`, `verification_email_failed`, `password_reset_email_failed` | The email service refused or was unreachable; the user action itself still worked | Check Resend status and the API key; users can retry |
| `weekly_reminder_failed`, `invoice_reminder_failed` | One reminder in the hourly cron failed; it is retried the next hour where that is safe | Look for a pattern (one bad address vs all) |
| `housekeeping_sweep_failed` | The hourly clean-up of spent rate limits, email links and OAuth codes failed | Harmless for a while; fix before tables grow |
| `invoice_logo_cleanup_failed` | A leftover logo row after deleting an invoice | Harmless |
| `mcp_internal_error`, `mcp_tool_error`, `mcp_last_used_update_failed` | A failure inside the MCP endpoint | Same as tRPC; the caller got a plain "try again" |
| `social_sign_in_failed`, `demo_sign_in_failed` | A GitHub/Google or sample-account sign-in failed | Check the provider's status and the secrets |
| `prisma_warmup_failed` | The early connection attempt failed; it reconnects on the first query | Only matters if it repeats |

## Shipping a change

Pushing to `main` is the release: CircleCI runs `npm run ci` (Biome, types, tests with the coverage floor), applies
D1 migrations (`wrangler d1 migrations apply DB --remote`), then deploys. Run `npm run ci` before every push. Two more
workflows run on GitHub: the same `npm run ci` for pull requests, a weekly dependency audit and CodeQL, and a nightly
browser-test run (`e2e.yml`).

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

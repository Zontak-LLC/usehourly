# Staging database probe at ~50 ms vs a 30 ms limit (2026-10-27)

Incident `usehourly-staging:check:database` (high), Day Shift R-101. Closed as **no app change**: UseHourly code is
not the cause, and the 30 ms limit is in Night Watch, not here. The fix is the Night Watch ticket below.

## What happened

Since 2026-10-27 18:41 the staging `/api/health` probe answers in 47-65 ms (spikes 131 and 138 ms) against a normal
of 7-16 ms. `ok: true` every time, 0 D1 errors in 15 minutes, D1 p95 still learning. Night Watch readings (last 3
probes each): 54, 51, 65; 47, 49, 53; 138, 47, 49; 131, 138, 47; 48, 50, 48 ms; limit 30 ms.

## Cause note

**Checked in the code (no app cause):**
- `src/app/api/health/route.ts:50-58` times two Prisma `$queryRaw` calls only: `SELECT 1` (`selectMs`) and one
  indexed read of the `health-probe` user (`probeMs`). Neither changed near 2026-10-27.
- `retryTransientD1` (`src/lib/d1-retry.ts`) adds one Proxy hop unless a read fails; D1 errors are 0, so no retries.
- A steady +35-40 ms on a two-query probe is the Worker-to-D1 round trip (placement, region or network), not our SQL.
- Staging runs `placement: { mode: "smart" }` (`wrangler.staging.example.jsonc:11`) and has no cron. Production has a
  `*/5` warm-up cron (`scripts/ci-wrangler-config.mjs:37`). Smart placement on a Worker with little traffic can move.
- The limit: `docs/operations.md` ("Is it healthy?") says Night Watch's Database monitor compares `selectMs` and
  `probeMs` with its own normal. No UseHourly test can fail on the 30 ms limit and pass after a fix.

**Not checked by the builder (its sandbox allows no network and no `git log`):**
- Reproduce: 5 calls to `curl -s -D - https://staging.usehourly.app/api/health`, recording `probeMs`, `selectMs` and
  the `cf-placement` header. Reproduces if most `probeMs` are over 30 ms with `ok: true`.
- `git log --since=2026-10-27T12:00 --until=2026-10-28T00:00 -- 'wrangler*.jsonc' scripts/ci-wrangler-config.mjs
  .circleci/ src/lib/prisma.ts`, and any merge to `next` that deployed staging near 18:41.

**For the owner or Day Shift (scoped Cloudflare access):**
- D1 > `hourly-staging-db` > Metrics: query time before and after 2026-10-27 18:41.
- Workers & Pages > `hourly-staging` > Deployments: any deploy near that time.
- **Stop rule:** if D1 Metrics query time also rose, D1 itself is slower and the limit change is the wrong fix. Stop
  and report; do not ship the Night Watch ticket.
- If `cf-placement` or the Deployments list shows placement moved, file a separate UseHourly ticket (placement or a
  staging warm-up cron). Not part of this ticket.

## Night Watch ticket (file this, test first)

**Title:** UseHourly staging database probe: fixed 150 ms ceiling (median of last 3), not 30 ms.

**Failing test first:** a scenario for site `usehourly-staging` with the readings above (probes 54, 51, 65; 47, 49,
53; 138, 47, 49; 131, 138, 47; 48, 50, 48 ms; D1 errors 0; health ok) expects no high incident. Today it fails with
"Database slow: queries 48 ms (normal 7.0–16 ms)" at high.

**Rule (staging only):** alert high when the median of the last 3 probes is over a fixed 150 ms. The ceiling does not
follow the learned normal, so a step change (12 to 50 ms) cannot drift it up and hide a later slowdown. The learned
7-day normal stays on the board as text only. No history is needed for this rule.

**Guard scenarios:**
- After a steady 50 ms level, three 200 ms readings raise a high incident.
- One 200 ms spike between 50 ms readings does not.
- A staging 503, a probe over 3,000 ms, or D1 errors > 0 still raise an incident.
- Production readings over production's current limit still alert (the staging rule never applies to `hourly`).

**Break it on purpose:** put the fixed 30 ms back for staging; the first scenario fails again.

**Rollback:** revert the Night Watch commit; the 30 ms staging limit comes back.

**Why this is not against house rule 10** (thresholds only get tighter): that rule is for the CI gate. This is a
monitor limit that was wrong for staging; production's limit does not change.

# Performance Check

One command runs a load test on staging and produces a report of performance stats, written as plain facts: "With 10,000 accounts and 50 people using it at once, pages loaded in 0.18 s on average, the slowest in 0.6 s, with 0 errors, at a cost of $0.04."

Owner request (2026-10-24): "an automated test… a stress test that stresses the application", then: "it would have to be performance stats. That's all we really need. Like for 10,000 users, this happened."

## How it is triggered

- `npm run perf-check` (staging only), with optional `--users=50 --minutes=10`.
- A **Run Performance Check** button in Day Shift and in Slack `#day-shift`, owner only.
- Nightly, and before each release.
- Never against production.

## What it does

1. **Data:** staging holds the realistic 10,000-account test data (`npm run stress:seed`: 60% tried it, 30% light, 9% regular, 1% heavy; 2.57 million entries, 66,881 invoices).
2. **Load, in steps:** virtual people in real browsers sign in as test accounts and use the app the way people do: open Today, log time, switch days, search, open Week, Month, Invoices, Clients and the Year summary, make an invoice, export. It runs at **10, then 25, then 50 people at once**, 3 minutes per step.
3. **Measures**, per step and per page: page time (median, p95, slowest), requests per second, server errors, database rows read and written, Worker CPU time.

A staging-only pass (`SWARM_TOKEN`, checked like the drill switch: staging build, long token, constant-time compare, 404 everywhere else) relaxes the per-account rate limits for the test accounts. Production can never accept it, and a test proves it.

## The report

A private link per run, also posted to Slack. It leads with sentences, then the numbers behind them:

- **The summary in words:** "With 10,000 accounts: at 10 people, pages took 0.15 s (median), 0.4 s at worst. At 50 people, 0.21 s and 0.9 s. 0 errors in 18,400 requests. Cost of the run: $0.04."
- **Per step** (10 / 25 / 50 people): median and p95 page time, slowest page, requests per second, errors.
- **Per page:** a bar chart of median and p95, slowest first, with the 1 s line.
- **Over time:** response time and requests per second minute by minute, so a slowdown under load shows.
- **Database:** rows read and written per step, and what that means against the monthly allowance ("this run used 0.4% of the month's included writes").
- **Compared with the last run:** each page faster or slower, in seconds and percent, plus the commits deployed in between.

## Build order

1. The load runner and the measurements, with the staging-only pass.
2. The report page.
3. Triggers: Day Shift button, Slack, nightly, the release routine.

## Notes

- Staging's demo button sometimes fails on the first tries with the 10,000-account data (seen 2026-10-24); the check uses test accounts, not demos, and reports demo creation time separately.
- The e2e `today()` helper uses UTC (issue 310); the runner fixes its time zone until that is fixed.

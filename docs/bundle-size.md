# Worker bundle size

Written by `npm run measure:bundle` after `npx opennextjs-cloudflare build`. Each run overwrites this file; compare
with the git history of the file.

- Date: 2026-11-04
- Commit: 430a487
- Raw: 12360001 bytes (11.79 MB)
- Gzip: 3891615 bytes (3.71 MB)

## Top 20 inputs of handler.mjs

Grouped by npm package or by `.next/server` chunk. Bytes are esbuild's bytesInOutput. Percent is of their sum
(12359022 bytes), which is not the raw file size: OpenNext edits handler.mjs after esbuild writes the metafile.

| # | group | bytes | MB | % |
| --: | :-- | --: | --: | --: |
| 1 | next | 2470840 | 2.36 | 20.0% |
| 2 | chunks/ssr/[root-of-the-server]__1ezfxml70nqh7._.js | 970415 | 0.93 | 7.9% |
| 3 | chunks/ssr/[root-of-the-server]__1mkodjpy42xyx._.js | 954934 | 0.91 | 7.7% |
| 4 | chunks/_1q5tf7zr-j954._.js | 558461 | 0.53 | 4.5% |
| 5 | chunks/_1p62ezew2zrws._.js | 558451 | 0.53 | 4.5% |
| 6 | chunks/[root-of-the-server]__0d4bnjjut0jds._.js | 433687 | 0.41 | 3.5% |
| 7 | chunks/ssr/_13dswl9edjid3._.js | 380719 | 0.36 | 3.1% |
| 8 | chunks/ssr/_1285fh8h4zjbp._.js | 380717 | 0.36 | 3.1% |
| 9 | chunks/ssr/[root-of-the-server]__0dfgh3_wvni0-._.js | 224573 | 0.21 | 1.8% |
| 10 | @prisma/client | 222524 | 0.21 | 1.8% |
| 11 | react-dom | 214144 | 0.20 | 1.7% |
| 12 | chunks/_0b7e517itr53e._.js | 201277 | 0.19 | 1.6% |
| 13 | chunks/_05d-rqbe44u4v._.js | 201276 | 0.19 | 1.6% |
| 14 | .prisma | 166500 | 0.16 | 1.3% |
| 15 | chunks/_1aebaeo292edq._.js | 136394 | 0.13 | 1.1% |
| 16 | chunks/_210w62dqbnl4a._.js | 136392 | 0.13 | 1.1% |
| 17 | chunks/ssr/[root-of-the-server]__16ifdi2pjx38e._.js | 129103 | 0.12 | 1.0% |
| 18 | chunks/ssr/node_modules_next_dist_1_6--c12g_0c8._.js | 123735 | 0.12 | 1.0% |
| 19 | chunks/node_modules_zod_v4_classic_external_0qoqh-q5drsgn.js | 122128 | 0.12 | 1.0% |
| 20 | chunks/ssr/_1g8o4mi0_8zu7._.js | 115376 | 0.11 | 0.9% |

## First-load client JS per route

Gzip of the chunks a route loads before it can be used: Next's `rootMainFiles` (`.next/build-manifest.json`) plus
every chunk in the route's `entryJSFiles` (`page_client-reference-manifest.js`), each counted once. Chunks loaded on
a click (exceljs, jspdf, the zip export, the export panels) are not in it. The run also checks that / and /privacy
load no zod (marker `$ZodType`). `npm run measure:bundle -- --before` replaces the Before table.

<!-- before:start -->
### Before (commit 153c79c, 2026-11-04)

| route | gzip bytes | KB |
| :-- | --: | --: |
| / | 266575 | 260.3 |
| /account-deleted | 257368 | 251.3 |
| /auth/v2/forgot-password | 263280 | 257.1 |
| /auth/v2/login | 265600 | 259.4 |
| /auth/v2/register | 266972 | 260.7 |
| /dashboard/account | 378046 | 369.2 |
| /dashboard/clients | 355566 | 347.2 |
| /dashboard/clients/[id] | 355566 | 347.2 |
| /dashboard/clients/archived | 330164 | 322.4 |
| /dashboard/insights | 334038 | 326.2 |
| /dashboard/invoices | 355340 | 347.0 |
| /dashboard/invoices/[id] | 355913 | 347.6 |
| /dashboard/invoices/new | 341432 | 333.4 |
| /dashboard/month | 395087 | 385.8 |
| /dashboard/report | 329876 | 322.1 |
| /dashboard/team | 341869 | 333.9 |
| /dashboard/today | 377486 | 368.6 |
| /dashboard/week | 391670 | 382.5 |
| /help | 303687 | 296.6 |
| /help/[slug] | 297246 | 290.3 |
| /invoice/[token] | 263777 | 257.6 |
| /oauth/authorize | 258131 | 252.1 |
| /privacy | 257368 | 251.3 |
| /reminders/off | 254069 | 248.1 |
| /reset-password | 261810 | 255.7 |
| /stop-emails | 254069 | 248.1 |
| /team | 254069 | 248.1 |
| /team/join/[token] | 268319 | 262.0 |
| /terms | 257368 | 251.3 |
| /timesheet/[token] | 262152 | 256.0 |
| /tools/hours-calculator | 258649 | 252.6 |
| /verify-email | 258183 | 252.1 |
<!-- before:end -->

### After (commit 430a487, 2026-11-04)

| route | gzip bytes | KB | KB vs before |
| :-- | --: | --: | --: |
| / | 236239 | 230.7 | -29.6 |
| /account-deleted | 227032 | 221.7 | -29.6 |
| /auth/v2/forgot-password | 233115 | 227.7 | -29.5 |
| /auth/v2/login | 235264 | 229.8 | -29.6 |
| /auth/v2/register | 236795 | 231.2 | -29.5 |
| /dashboard/account | 343027 | 335.0 | -34.2 |
| /dashboard/clients | 325178 | 317.6 | -29.7 |
| /dashboard/clients/[id] | 325178 | 317.6 | -29.7 |
| /dashboard/clients/archived | 299900 | 292.9 | -29.6 |
| /dashboard/insights | 303774 | 296.7 | -29.6 |
| /dashboard/invoices | 324854 | 317.2 | -29.8 |
| /dashboard/invoices/[id] | 325427 | 317.8 | -29.8 |
| /dashboard/invoices/new | 311035 | 303.7 | -29.7 |
| /dashboard/month | 356985 | 348.6 | -37.2 |
| /dashboard/report | 299612 | 292.6 | -29.6 |
| /dashboard/team | 311605 | 304.3 | -29.6 |
| /dashboard/today | 346488 | 338.4 | -30.3 |
| /dashboard/week | 353840 | 345.5 | -36.9 |
| /help | 274368 | 267.9 | -28.6 |
| /help/[slug] | 267774 | 261.5 | -28.8 |
| /invoice/[token] | 233285 | 227.8 | -29.8 |
| /oauth/authorize | 227795 | 222.5 | -29.6 |
| /privacy | 227032 | 221.7 | -29.6 |
| /reminders/off | 223733 | 218.5 | -29.6 |
| /reset-password | 231628 | 226.2 | -29.5 |
| /stop-emails | 223733 | 218.5 | -29.6 |
| /team | 223733 | 218.5 | -29.6 |
| /team/join/[token] | 238210 | 232.6 | -29.4 |
| /terms | 227032 | 221.7 | -29.6 |
| /timesheet/[token] | 231969 | 226.5 | -29.5 |
| /tools/hours-calculator | 228313 | 223.0 | -29.6 |
| /verify-email | 227847 | 222.5 | -29.6 |

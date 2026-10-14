# UseHourly

**A simple timesheet for freelancers.** Log your day in seconds: type `1.5`, `1:30` or `90m`, press Enter, done.

**Live:** https://usehourly.app · Free to use, no paywall, no ads.

![The weekly timesheet](public/landing/week.webp)

## What it does

- **Quick entry.** Pick a project, type the time the way you would say it, add a note. Or press Start and let the timer count.
- **Weekly timesheet.** Every project and every day in one editable grid. Fill several days at once, add more entries to a day, move an entry to another date.
- **Month calendar** with per-project totals.
- **Invoices.** Turn billable hours into a PDF invoice, track paid and unpaid, re-download any time.
- **Annual report.** Hours, earnings, invoiced and received by quarter and month, ready for your accountant.
- **Export.** Excel for any week, month or custom date range (for example March 3 to April 20), and one zip with everything: every client, all time.
- **Your data is yours.** Per-user isolation; everything you log can be exported at any time.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui · NextAuth v5 (credentials) · tRPC v11 · Prisma 7 with Cloudflare D1 · Vitest · Biome · deployed to Cloudflare Workers with OpenNext.

## Run it locally

You need Node 22+.

```bash
npm install                 # also runs `prisma generate`

# .env.local and .dev.vars (keep the two in sync):
#   AUTH_SECRET=<a long random string, e.g. `openssl rand -base64 32`>
#   AUTH_URL=http://localhost:3028

npm run d1:migrate:local    # create the local D1 database
npm run dev                 # http://localhost:3028
```

Register an account on the sign-up page and you are in.

```bash
npm test                    # scenario tests (Vitest)
npx biome check src         # lint and format
```

## Deploy

It runs on Cloudflare Workers with a D1 database:

1. Create a D1 database and put its id in `wrangler.jsonc`.
2. `npm run d1:migrate:remote`
3. `npx wrangler secret put AUTH_SECRET`
4. `npm run deploy`

`wrangler.jsonc` pins the Cloudflare account and the custom domain; change both for your own account.

## Support

UseHourly is free. If it saves you time you can [sponsor it on GitHub](https://github.com/sponsors/Zontak-LLC).

### Supporters

Thank you to everyone who helps keep UseHourly free:

<!-- supporters:start -->
_Be the first: [sponsor UseHourly on GitHub](https://github.com/sponsors/Zontak-LLC)._
<!-- supporters:end -->

## Credits and license

Built on the excellent [next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) template by Mohammed Arham Khan.

Released under the [MIT License](LICENSE). The code is open; the name "UseHourly" and its logo are not part of the license.

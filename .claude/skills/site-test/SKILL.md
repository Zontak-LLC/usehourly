---
name: site-test
description: Run UseHourly's full browser test (a new freelancer's first day, on desktop and phone), then review the screenshots like a first-time user and report what is broken or confusing. Use when the user asks for a full site test, a usability check, "is it intuitive", or before shipping UI changes.
---

# Site test

Two layers, in this order. The first says whether things **work**; the second says whether they are **easy to understand**.

## 1. Run the scripted tests (about a minute)

```bash
cd ~/Projects/usehourly
npm run e2e          # both devices: desktop 1280x800 and a Pixel 7 phone
npm run e2e:summary  # writes e2e/report/summary.md
```

- It starts its own copy of the app on port **3029** (own build folder) and a stand-in for Resend on **8899**. The normal dev server on 3028 is not touched. Nothing is sent to real people.
- The sign-up robot check is off for these runs only. Every account it makes starts with `e2e-` and is deleted afterwards (`e2e/global-teardown.ts`); if a run dies, running it again also cleans up.
- Run only one device with `npm run e2e:desktop` or `npm run e2e:phone`; one file with `npx playwright test e2e/public.spec.ts`. Open the HTML report with `npm run e2e:report`.
- **Never point it at production** (`E2E_BASE_URL=https://usehourly.app`) without the owner saying so in this conversation: it would create real accounts and send real mail.
- If a test fails, read the message and the `error-context.md` / screenshot under `e2e/report/artifacts/` before deciding whether the **app** or the **test** is wrong. Several early failures were the test's fault (stale email, a hidden duplicate element); say which it was. Never loosen a check just to turn a run green.

What the scripted run already checks on every page it visits: a readable name on every button, link and field; every form posts; no sideways scroll; a title and one heading; no browser errors or 5xx; axe accessibility (only "critical" fails). On the phone it also gives **advice** on controls under 24px. It also counts **actions** for three jobs (sign up, sign-up to first entry, make an invoice) and fails if a job gets harder: today they are 5, 5 and 2.

## 2. Review it like a first-time user (the part a script cannot do)

Read `e2e/report/summary.md`, then **open the screenshots** (`e2e/report/screens/desktop` and `phone`, numbered in journey order) and look at each screen as someone who has never seen the app. Judge with this list and cite the screenshot for each finding:

1. **Can I tell what to do next?** One obvious primary action per screen; no more than about 3 to 4 controls in a toolbar; icon-only buttons are labelled or obvious.
2. **Does it say the same thing everywhere?** Compare the sidebar name, the page heading, the browser title and any link or warning that points to it. (Known past mismatches: "My work" vs "Clients & projects", "Year summary (taxes)" vs "Annual report".)
3. **Does it speak my language?** Flag jargon (a "wand", "snapshot", "sign-off" with no hint) and options that need a paragraph to explain.
4. **Is the empty state kind?** First visit to each page with no data: no filters for nothing, no instructions pointing at things that are not there yet.
5. **Can I recover from a mistake?** Edit and delete reachable (on a phone without hover), money mistakes blocked or clearly warned ($0 invoice, missing rate).
6. **Does money show clearly?** Rates, totals and paid states visible where decisions are made.
7. **Does it work with a thumb?** Use the phone screenshots and the tap-target advice.
8. **Is anything crowded?** Count the things competing for attention on each screen.

Protect the core: **Today is the product.** Sign-up to first logged entry should stay a handful of actions with no reading. Everything else should be easy to find but quiet.

## 3. Report

- Lead with the verdict in one or two sentences, then the numbers (tests passed, actions per job on each device).
- List findings by how much they would confuse a newcomer (most first): what, where (page and screenshot), and a concrete fix. Separate **bugs** (broken or unsafe) from **confusion** (works but unclear).
- Compare with what is already tracked: `gh issue list --search "walkthrough"` and issue #38. Say what is **new**, what is **fixed**, and what is **still open**.
- Say plainly what this review cannot tell: it is an expert read, not real users. Five real freelancers doing the same jobs while talking aloud finds what this misses.
- Do not open or edit tickets, commit, or push unless asked.

## Extending the tests

- Journeys live in the four `e2e/first-day-*.spec.ts` parts (start, rate, invoice, share-delete; each makes its own account and runs on its own worker) and `e2e/public.spec.ts`. Helpers (page checks, mail reader, database helper, anonymous client sessions) are in `e2e/helpers.ts`.
- Find things the way a person does: by visible label and role (`getByRole("button", { name: ... })`), not by CSS. Wait for a save to finish before leaving a page.
- When adding a feature, add its step to the journey and make sure its buttons have names; the page checks then cover it automatically.

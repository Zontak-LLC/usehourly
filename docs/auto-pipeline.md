# The automatic ticket pipeline

How Claude works through GitHub tickets on its own (written 2026-10-22). The owner leaves a laptop running with a Claude
Code session open; Claude takes tickets labelled `auto` one after another, builds, tests, ships and checks them, and
stops when the queue is empty or something fails twice. **The site is production with real users: every safeguard stays.**

## What may be `auto`
Small, well described, low risk. **Never `auto`:** database migrations, sign-in or security, invoices and money, email
sending, the deploy or CI setup, anything the ticket itself says needs a decision. Those wait for the owner (label them
`needs-human`). A ticket with no clear "Done when" is not ready: Claude comments with a question and labels it `needs-human`.

## The loop (per ticket)
1. **Pick** the oldest open issue labelled `auto` that is not `needs-human` and has no open pull request. If any open
   issue carries **`auto-hold`**, stop everything (the kill switch).
2. **Branch** from the CURRENT `origin/next` (recreate `next` from `main` first if a release just merged and GitHub deleted it).
3. **Build** it. UI changes follow `docs/ui-spec.md` (Best practices and the checklist). Every bug fix and every new control
   ships with a test that fails without it.
4. **Check:** `npm run ci`, plus the browser tests for what the change touches; a cold review by a fresh reviewer agent
   (`feature-dev:code-reviewer`) of the diff; for anything visible, screenshots before and after in the pull request.
5. **Merge** into `next` (squash, one commit per ticket). Comment on the ticket with what changed and the test result.
6. **Ship** when the queue is empty or after about 5 tickets: one pull request `next` to `main`, the full CI and browser
   suite green (never merge a red or pending check), rollback points written into the pull request (current Worker version
   id and the D1 Time Travel bookmark), merge, watch the CircleCI deploy.
7. **After the deploy:** the `smoke` job drives the live site and rolls back by itself on two failures
   (`docs/operations.md`). Claude also checks `/api/health` and, for a visual release, runs the independent UI review.
8. **Close** the shipped tickets with a short summary and the release pull request link.

## When to stop
- The queue is empty; `auto-hold` appears; a ticket fails its checks twice, the smoke test fails, or a rollback happens: stop,
  comment on the ticket with what happened, label it `needs-human`, and tell the owner.
- At most **5 tickets per day** unless the owner says otherwise.
- Never force-push `main`, never skip a hook or a check, never change secrets, billing or the deploy token, never touch real
  users' data.

## Writing a ticket Claude can finish (use the "Ticket for the pipeline" form)
- **What:** one change, in plain words.
- **Where:** the page or screen (a screenshot helps a lot).
- **Done when:** two or three things you can see, such as "on a phone the list shows 3 items".
- **Not in scope:** what must not change.
- Add the `auto` label when you want it picked up.

## Practical
Keep the laptop awake and plugged in (`caffeinate -dimsu`), the Claude Code session open, and terminal permissions
allowing the usual commands, or the run stalls on a prompt.

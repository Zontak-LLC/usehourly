# UseHourly usability test (5 people, 30 minutes each)

Purpose: find out where a first-time freelancer gets stuck, **before** the Show HN post (Tue Oct 20) sends strangers to the site. The browser tests prove the app works; this proves people can *find* what works.

## 0. The claim this test proves (or disproves)
"UseHourly is intuitive" is an opinion. These are the numbers that back it up, measured with this test:
- **First hour in under 60 seconds:** a new person signs up and logs their first entry (task 2) in under 60 s of their own time, with no help. Target: 4 of 5 people.
- **Every core task done without help:** tasks 2 to 8 marked "yes" (not "aided") by at least 4 of 5 people.
- **SUS of 80 or more** (section 4b). 68 is an average product; 80+ is "excellent" and is the number you may quote.
- **Ease per task:** the 1 to 7 question averages 6 or more on every core task.
If a number misses, the product is not yet "intuitive" on that point: fix it and re-test with one fresh person.

## 1. Who and how
- **5 people** who bill by the hour or could (freelancers, contractors, consultants, a small-agency owner). Not other developers who already know the project. At least **2 who have never used a time tracker**, and at least **2 on their phone** (the rest on a laptop).
- One at a time, **30 minutes**, in person or on a video call with screen share. Five people uncover about 85% of the big problems; more adds little.
- Run all five before Tuesday. Each person uses a **private window** (or their phone's browser) and a **fresh sign-up**, so the first-run screens are real.
- Ask permission to record the screen (their voice and screen only). Nothing is shared outside the team.

## 2. Facilitator rules (the hard part)
- Say: "We're testing the site, not you. If something's confusing, that's the site's fault. Please think out loud."
- **Do not help.** If they ask "should I click this?", answer "What would you do if I weren't here?" Step in only after about 2 minutes stuck, and write down that you had to ("aided").
- Never use the app's words in the task ("click Projects"). Describe the goal in plain words.
- Don't explain the product first. They get only the one-line description in task 1.
- Stay quiet during silences. Count wrong clicks, don't comment.

## 3. Tasks (read each aloud, one at a time)
Give them this made-up context: *"You're a freelance designer. Today you worked 2 hours for a client called Acme Studio on their logo. You charge $60 an hour."*

| # | Task (say it like this) | What "done" looks like |
|---|---|---|
| 1 | "You just landed on this page. In your own words, what is this for, and who is it for?" (look for 10 seconds, then explain) | Says something like "track my hours and bill clients" |
| 2 | "Create an account and record your 2 hours for Acme Studio." | Account made, one 2:00 entry exists |
| 3 | "You also did 45 minutes this morning for a different client, Brightside. Add that too." | A second client and project with 0:45 |
| 4 | "Oops, the Acme time was really 2 and a half hours. Fix it." | Entry now 2:30 |
| 5 | "How many hours did you work this week in total?" | Reads the total (3:15, or 3.25 h) |
| 6 | "Tomorrow you're about to start working. Make the app time it for you, then stop it." | Timer started and stopped |
| 7 | "Set your hourly rate for Acme to $60." | Rate saved on the project |
| 8 | "Make an invoice for Acme for this month." | Invoice created and PDF offered |
| 9 | "Say the client has paid you. Mark that." | Invoice shows Paid with a date |
| 10 | "Get all your hours out into a spreadsheet." | Excel file downloaded |
| 11 (phone people) | "On your phone, add 1 hour for Brightside to today." | Entry added without help |

Stop a task at 3 minutes ("let's move on") and mark it failed.

## 4. Record per task (one row each, per person)
| Person | Task | Done? (yes / aided / no) | Seconds | Wrong clicks | Quote or what they said |
|---|---|---|---|---|---|

- After each task ask: **"How easy was that, 1 (hard) to 7 (easy)?"**
- Known good numbers from the automated test: signing up takes about 5 actions, the first entry about 5, an invoice about 2. A person taking far more than that is a finding.

## 4b. SUS: the standard ten questions (2 minutes, right after the last task)
Ask each person to answer every statement from **1 (strongly disagree) to 5 (strongly agree)**, without thinking long. Use these exact words, so the score compares with other products:
1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to be able to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

**Score:** for odd questions (1, 3, 5, 7, 9) take the answer minus 1; for even ones (2, 4, 6, 8, 10) take 5 minus the answer. Add the ten results and multiply by 2.5. That gives 0 to 100 per person; report the average of the five. **68 = average, 80+ = excellent, under 50 = real trouble.**

## 5. Ten-minute interview at the end
1. What was the most confusing moment?
2. What did you expect to find that wasn't there?
3. The "Projects" page: what did you think it was for before you opened it?
4. Is there anything here you'd use daily? Anything you'd never touch?
5. What do you use today to track time and send invoices? Would you switch? Why or why not?
6. Would you recommend it to a friend who freelances? What would you tell them?
7. Anything you didn't trust? (Free, no ads, who sees my data?)

## 6. Turning notes into fixes
- Rate each problem: **Blocker** (couldn't finish), **Major** (finished but slowly or with help), **Minor** (grumbled).
- Count how many of the 5 hit it. **3 or more of 5 = fix before Tuesday.** One person on a rare path = write it down, don't rush.
- Group by screen, fix the top three, then re-run the failing task with one fresh person.
- Put the list in issue #38 (usability) so the automated browser checks can guard each fix.

## 7. Before and after each session
- **Before:** open https://usehourly.app in a private window, note the time; have the screen recorder ready; keep a laptop and a phone handy.
- **After:** ask them to delete their test account (Account, then Delete my account) or do it for them with their OK. Thank them, and say you'll tell them what changed.
- Don't read out or save anything they type, such as passwords.

## 8. Message you can send
> Hi [name]. I built a small free site for freelancers to log hours and make invoices, and before I show it to the world I'd like 30 minutes of watching a real person use it. You'd do a few tasks on your laptop or phone while talking through what you're thinking. I'm testing the site, not you. Can we do [day, time]? I'll send a link and delete your test account afterwards.

## 9. Schedule (suggested)
- Sat to Sun, Oct 18-19: recruit and run the first 2 or 3 sessions
- Mon Oct 19: finish sessions 4 and 5, fix the top blockers, re-test one task
- Tue Oct 20 morning: go/no-go on the Show HN post (scheduled around 9:07 ET). If a blocker remains, pause the post

## 10. Between human tests: AI first-time users (cheap, nightly)
Real people are the proof; an AI "first-time user" is the smoke alarm. The QA agent Maya (an everyday, non-technical persona) runs tasks 2 to 10 on a local copy with a fresh account, no hints, and records actions, dead ends and confusion per task. Compare with the "known good numbers" in section 4: a task that suddenly takes many more actions means a change made it harder. Planned as Forge's "AI users" epic (dayshift #99).

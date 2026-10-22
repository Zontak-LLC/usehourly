import type { Topic } from "./types";

export const TIME_TOPICS: Topic[] = [
  {
    slug: "typing-time",
    title: "Typing a time quickly",
    group: "time",
    summary: "The shapes UseHourly understands, and what a plain number means.",
    keywords: ["duration", "hours", "minutes", "format", "1.5", "90m", "decimal", "enter"],
    body: `Click the time box (it is already focused on a computer), type, and press **Enter**. These all work:

- \`1.5\` is one and a half hours
- \`1:30\` is one hour thirty minutes
- \`90m\` is ninety minutes
- \`2h\` is two hours, and \`1h30\` is one hour thirty

## A plain number

A plain number up to **12** means hours (\`4\` is four hours). A bigger plain number means minutes (\`45\` is forty-five minutes, \`90\` is ninety). To be explicit, add a letter: \`4m\` is four minutes and \`2h\` is two hours.

The line under the box ("Day total 2:00 → 3:30") shows what the day will total before you add. One entry can be up to 24 hours.`,
  },
  {
    slug: "timer",
    title: "The timer",
    group: "time",
    summary: "One timer at a time, how it rounds, and what you need a connection for.",
    keywords: ["start", "stop", "running", "stopwatch", "track live"],
    body: `Use **Start timer** on Today when you have not done the work yet. The running timer stays at the top of the page with a large **Stop** button.

- Only **one** timer runs at a time. Starting another stops the first and keeps its time.
- Stopping rounds the elapsed time **up** to at least one minute.
- A timer needs a connection. If you are offline, type the time in the box instead: it is saved on your device and sent when you are back online (see [Working offline](/help/offline)).`,
  },
  {
    slug: "non-billable",
    title: "Non-billable days and projects",
    group: "time",
    summary: "Time you track but never charge for, and what it is left out of.",
    keywords: ["holiday", "unpaid", "free", "not charged", "exclude", "invoice", "tax"],
    body: `There are two ways to keep time out of your invoices.

## A whole day

Use **Mark day non-billable** (the crossed-circle button on Today and at the top of a day on Week and Month). Use it for a holiday, an unpaid day or work for yourself. Time on that date is **left out of**:

- invoices you create
- the year summary
- Excel and CSV exports

It still **shows** in the day, week and month totals, and in a timesheet you share with a client for sign-off. Nothing is deleted, and time you add to that date later is covered too. Click the button again to undo it.

## A whole project

On the Clients page, edit a project and untick **Billable**. It then has no rate and is never invoiced.

> Marking a single entry non-billable is not available yet. Today, move it to a non-billable project.`,
  },
  {
    slug: "moving-and-merging",
    title: "Moving, merging and adding to several days",
    group: "time",
    summary: "Fixing time that went on the wrong project or day, and filling many days at once.",
    keywords: ["move", "merge", "combine", "wrong project", "wrong day", "several days", "bulk", "duplicate"],
    body: `## Move an entry

Each entry has a **Move** button. Pick a nearby day or any date. Nothing else about the entry changes. To change its **project**, click the project name on the entry.

## Merge entries

When a day has two or more entries on the **same project**, a bar offers to merge them into one. The times add up and the descriptions are joined, one per line (blank ones and exact repeats are skipped). Entries on different projects, or a running timer, cannot be merged: move them first.

## Add to several days

On **Month**, use **Add to several days** to put the same time on many days at once, for example 8 hours every weekday in a week. Days that already hold several entries or a running timer are skipped and listed, never changed.`,
  },
  {
    slug: "budgets",
    title: "Project budgets",
    group: "time",
    summary: "Set a limit in hours or money and get a warning before you pass it.",
    keywords: ["limit", "cap", "retainer", "warning", "over budget", "80%"],
    body: `Edit a project on the Clients page and fill in **Budget**: an amount, whether it is in **hours** or **money** (in your account's currency), and whether it **resets each month** or covers the **whole life** of the project. Clear the amount to remove it.

A bar appears under the project and above the time box when you add time. It turns yellow at **80%** and red at **100%**, and the words say the same ("nearly used up", "over budget").

- A money budget prices time at the project's hourly rate. A non-billable project uses none of a money budget.
- Time on days you marked non-billable does not count.
- It is a warning only: nothing stops you logging more.`,
  },
  {
    slug: "calendar-suggestions",
    title: "Time entries from your calendar",
    group: "time",
    summary:
      "Connect Google Calendar, import a calendar file or connect a private calendar address, and each day shows its meetings ready to log in one tap.",
    keywords: [
      "calendar",
      "meetings",
      "ics",
      "google calendar",
      "outlook",
      "apple calendar",
      "suggest",
      "import",
      "secret address",
      "ical",
      "link",
      "sync",
    ],
    body: `On **Today**, the box **Turn meetings into time entries** shows up to three ways to connect, side by side: **Google Calendar**, **Calendar file** and **Private address**. Pick one.

The quickest is **Connect Google Calendar** (when it is switched on for this site): Google's own window asks you to allow UseHourly to read your events, read-only, and your browser then reads them straight from Google, so nothing passes through UseHourly's servers. The permission lasts about an hour, so press **Refresh** to read newer meetings (a Google window opens again, usually just to confirm). **Disconnect** forgets the meetings, and you can remove the access any time at myaccount.google.com/permissions. The file and private-address options below work with any calendar.

With a file instead: press **Add a calendar file** and choose a calendar file (**.ics**). Each day then shows **From your calendar**: the day's meetings, each with its length and a project. Press **Add** to log it (the meeting's title becomes the description), or **Skip** to hide it for good. Nothing is added unless you press Add.

## Getting the file
- **Google Calendar:** on a computer, Settings, **Import & export**, **Export**. You get a zip; open it and use the .ics file for your calendar.
- **Apple Calendar:** File, **Export**, **Export...**
- **Outlook:** save the calendar as an iCalendar (.ics) file.

Choose **Update** on Today to read a newer file. **Remove calendar** forgets it.

## Keeping it up to date by itself
Instead of a file, press **Use a private address** and paste your calendar's private address. UseHourly then reads it again whenever you open Today and the last read is older than half an hour, and **Refresh** reads it right away.
- **Google Calendar:** on a computer, Settings, choose your calendar, **Integrate calendar**, and copy the **Secret address in iCal format**.
- **Outlook and iCloud:** publish the calendar and copy its address. Only Google, Outlook and iCloud addresses work; for another calendar, add a file.
- Anyone who has the address can read that calendar. If it leaks, use Google's **Reset** next to it, then paste the new one.

## What is shown
- Meetings that start that day, with their time and length. All-day events, events marked free, cancelled ones and meetings you declined are left out, and so are blocks longer than 8 hours.
- Repeating meetings, with dates taken out or moved, are handled. Times follow the time zone written in the file.
- The project is guessed when the title names one clearly (a project's own name, or a client with a single project). Otherwise you pick it. A meeting already logged that day (same description and length) is not offered again.

## Privacy
The file is read **on your device**. Only the title, start and end of meetings from the last 3 months are kept, in this browser, for your account; they are removed when you log out or press **Remove calendar**. The file itself is never kept, and nothing is sent to UseHourly.

With a private address, the address is kept only in this browser too. When it is read, the address passes through UseHourly's server once to fetch the calendar for you (calendar services do not let a web page read it directly); it is not stored or logged there. Press **Remove calendar** to forget it.`,
  },
];

import type { Answer } from "./types";

/** Logging time: found by searching. */
export const TIME_ANSWERS: Answer[] = [
  {
    id: "clients-projects",
    question: "How do I add a client or a project?",
    keywords: ["new client", "add client", "new project", "add project", "customer", "general", "setup", "start"],
    answer: `Your first visit asks "Who do you work for?". The answer becomes your first client, with a project called **General**, so you can log time at once.

- **Another client:** open **Clients** and press **+** (New client) at the top.
- **Another project:** press **Add project** on the client's card. Set its hourly rate there, or tick **Not billable**.

Time is always logged on a project, and each project belongs to one client.`,
  },
  {
    id: "typing-time",
    question: "What can I type in the time box?",
    keywords: ["duration", "hours", "minutes", "format", "1.5", "90m", "decimal", "enter", "log time"],
    answer: `Type the time and press **Enter** (or **Log time**). These all work:

- \`1.5\` is one and a half hours
- \`1:30\` is one hour thirty minutes
- \`90m\` is ninety minutes
- \`2h\` is two hours, and \`1h30\` is one hour thirty

A plain number up to **12** means hours (\`4\` is four hours). A bigger plain number means minutes (\`45\` is forty-five minutes). The chips under the box add time: press **2h** twice for four hours. The × in the box clears it. One entry can be up to 24 hours.`,
  },
  {
    id: "add-note",
    question: "Do I have to write a description? How do I add one later?",
    keywords: ["description", "note", "notes", "later", "add note", "what did you work on", "optional", "invoice text"],
    answer: `No. The description is optional: type the time and press **Enter**, and the time is logged. You can add the note later in three ways:

- **Right after you log:** the description box then says **Add a note to the 1:30 you just logged**. Type the note and press **Enter**: it goes on that entry. **Escape** lets it go. Type the next time and the box is for the next entry again.
- **In any list of entries** (Today, Week, Month): an entry with no note shows **+ Add note**. Press it, type, then press **Enter**. **Escape** cancels.
- **At the end of the day:** the day card on Today says how many entries have no note yet. **Add notes** opens the first one; **Enter** saves it and opens the next. **Not now** hides the line for that day on this device.

Clients see the descriptions on your invoices, so a short note helps them. If you type the description before you press Log time, it is saved with the entry.`,
  },
  {
    id: "timer",
    question: "How does the timer work?",
    keywords: ["start", "stop", "running", "stopwatch", "track live", "resume", "forgot", "discard", "undo"],
    answer: `Pick the project in the **Log time** card on Today, then press **Start timer** at the foot of the card. The timer runs on that project. While it runs, it shows at the top of the same card, and the time counts up there and in your totals.

- **Stop timer** saves the time at once and says so ("Saved 0:42"). Use − or + 5 min to correct it, **Undo** to throw it away, **Resume timer** to carry on, or **Done**.
- Forgot to start it? Just after you start, **Started earlier?** moves the start back by 15 min, 30 min or 1 hour. After 4 hours, **Still working?** lets you stop it at the time you really stopped.
- Only **one** timer runs at a time. A timer counts at most 24 hours, so one left running cannot add days.
- A timer needs a connection. Offline, type the time in the box instead.`,
  },
  {
    id: "edit-entry",
    oldSlugs: ["moving-and-merging"],
    question: "How do I fix an entry with the wrong time, day or project?",
    keywords: ["edit", "change", "move", "wrong day", "wrong project", "mistake", "delete", "remove", "fix"],
    answer: `Press **Edit** on the entry (or click the entry itself). There you can change the **Project**, the **Day** (to move it), the **Time** (the chips add or take away minutes) and the **Description**. **Delete** is at the bottom left of the same form.

After you move an entry to another day, the message that says where it went has **Undo**.

An entry that is already on an invoice says **Invoiced**. You can still change it, but the invoice you made stays as it was.`,
  },
  {
    id: "non-billable",
    question: "How do I track time I don't charge for?",
    keywords: ["non-billable", "not billable", "unpaid", "holiday", "internal", "free work", "exclude", "admin"],
    answer: `Put that time on a **not billable** project. When you add a project on **Clients**, tick **Not billable**; for a project you already have, press **Edit** and untick **Billable**.

A not billable project has no rate and never goes on an invoice. Its time still shows in your day, week and month totals.`,
  },
  {
    id: "calendar-suggestions",
    feature: "calendar",
    question: "How do I turn calendar meetings into time entries?",
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
    answer: `On **Today**, **Turn meetings into time entries** offers the ways to connect a calendar. Each day then shows **From your calendar**: the day's meetings with their time and length. Press **Add** to log one (its title becomes the description) or **Skip** to hide it for good. Nothing is added unless you press Add.

- **Add a calendar file:** an **.ics** file. Google Calendar: Settings, **Import & export**, **Export** (open the zip). Apple Calendar: File, **Export**. Outlook: save as iCalendar. **Update** reads a newer file.
- **Use a private address:** Google: Settings, your calendar, **Integrate calendar**, **Secret address in iCal format** (Outlook and iCloud work too). It is read again when you open Today after half an hour; **Refresh** reads it now. Anyone with the address can read the calendar: if it leaks, reset it in Google.
- **Connect Google Calendar**, where this site has it set up: read-only, straight from Google to your browser.

**Remove calendar** forgets it. See [how the project is picked](/help?a=calendar-projects) and what stays on your device.`,
  },
  {
    id: "calendar-projects",
    feature: "calendar",
    question: "How does UseHourly pick the project for a calendar meeting?",
    keywords: ["calendar", "meetings", "rule", "always", "project", "privacy", "declined", "all-day"],
    answer: `A meeting gets a project when its title names one clearly: a project's own name, or a client with a single project. Otherwise you pick it.

When you pick a project yourself and press **Add**, UseHourly asks once: **Always put "acme" meetings on Design?** Press **Always**: from then on a meeting with that word in its title has that project picked (the row says "your rule for acme"). You can still change it before you press Add. **Forget my meeting rules**, under the list, removes them.

## What is shown
Meetings that start that day. All-day events, events marked free, cancelled ones, meetings you declined, blocks over 8 hours and meetings already logged (same description and length) are left out.

## What stays on your device
The calendar is read **in your browser**. Only the title, start and end of meetings from the last 3 months are kept, with your rules, in this browser for your account. They are removed when you log out or press **Remove calendar**. A private address passes through UseHourly's server only to fetch the calendar; it is not stored or logged there.`,
  },
  {
    id: "missed-days",
    question: 'Today says "Nothing logged on Thursday". What is that?',
    keywords: ["missed", "forgot", "no time", "empty day", "gap", "reminder", "not now", "yesterday"],
    answer: `When your last working day has no time, **Today** says so in one line at the foot of the day card: **Nothing logged on Thursday**.

- **Add it now** opens that day, so you can log what you did.
- **Not now** hides the line for that day, on this device.
- Older weekdays of the last week with no time show as small buttons after **No time:**. Each opens its day.

Days before you started logging are never counted, and neither are weekends. UseHourly only says this in the app: it never emails you about it.`,
  },
];

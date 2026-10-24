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
];

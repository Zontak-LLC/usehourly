import type { Answer } from "./types";

/**
 * Answers about features hidden in this release (lib/features.ts). They are not shown or searched until the feature is
 * switched on; re-read each against the app then. Kept here so a "?" beside a hidden setting always has an answer.
 */
export const HIDDEN_ANSWERS: Answer[] = [
  {
    id: "invoice-tax",
    feature: "invoiceTax",
    question: "How do I add VAT, GST or sales tax to my invoices?",
    keywords: ["vat", "gst", "hst", "sales tax", "tax rate", "tax number", "registration", "reverse charge"],
    answer: `On **Account**, **Invoices**, fill in the **Tax** card: the name of the tax (VAT, GST, HST, Sales tax or your own word), the **rate** as a percentage (for example 20 or 7.5) and **your tax number**. Press **Save tax**.

Each new invoice then shows a **Subtotal**, the tax row (for example "VAT (20%)") and the **Total** the client pays. The tax is worked out once on the subtotal and rounded to the cent.

- To leave the tax off one invoice (a client who accounts for it themselves), untick **Add VAT (20%)** under the preview when you make it.
- Your tax number prints on every new invoice when it is filled in, with or without the tax.
- Invoices you already made never change. Leave the rate empty to add no tax.`,
  },
  {
    id: "budgets",
    feature: "budgets",
    question: "How do I set a budget for a project?",
    keywords: ["limit", "cap", "retainer", "warning", "over budget", "80%"],
    answer: `Edit a project on the Clients page and fill in **Budget**: an amount, whether it is in **hours** or **money** (in your account's currency), and whether it **resets each month** or covers the **whole life** of the project. Clear the amount to remove it.

A bar appears under the project and above the time box when you add time. It turns yellow at **80%** and red at **100%**, and the words say the same ("nearly used up", "over budget").

- A money budget prices time at the project's hourly rate. A non-billable project uses none of a money budget.
- Time on days you marked non-billable does not count.
- It is a warning only: nothing stops you logging more.`,
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
    answer: `The quickest way is **Connect Google Calendar** on **Today** (when it is switched on for this site): Google's own window asks you to allow UseHourly to read your events, read-only, and your browser then reads them straight from Google, so nothing passes through UseHourly's servers. The permission lasts about an hour, so press **Refresh** to read newer meetings (a Google window opens again, usually just to confirm). **Disconnect** forgets the meetings, and you can remove the access any time at myaccount.google.com/permissions. The file and private-address options below work with any calendar.

With a file instead: on **Today**, press **Add a calendar file** and choose a calendar file (**.ics**). Each day then shows **From your calendar**: the day's meetings, each with its length and a project. Press **Add** to log it (the meeting's title becomes the description), or **Skip** to hide it for good. Nothing is added unless you press Add.

## Getting the file
- **Google Calendar:** on a computer, Settings, **Import & export**, **Export**. You get a zip; open it and use the .ics file for your calendar.
- **Apple Calendar:** File, **Export**, **Export...**
- **Outlook:** save the calendar as an iCalendar (.ics) file.

Choose **Update** on Today to read a newer file. **Remove calendar** forgets it.

## Keeping it up to date by itself
Instead of a file, press **Or connect with a private calendar address** and paste your calendar's private address. UseHourly then reads it again whenever you open Today and the last read is older than half an hour, and **Refresh** reads it right away.
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
  {
    id: "invoice-rounding",
    feature: "rounding",
    oldSlugs: ["rounding"],
    question: "How do I round time on a client's invoices?",
    keywords: ["round up", "round", "quarter hour", "15 minutes", "minimum", "increment", "billing details"],
    answer: `Some clients are billed in blocks (for example every quarter hour). Set it per client: on the Clients page, open the client's **Billing details** and choose:

- **Round to** none, 6, 15 or 30 minutes
- **Up** or to the **nearest** step
- A **minimum** number of minutes per entry

Each **entry** is rounded on its own, then added up. A zero stays zero. The invoice, its PDF and the client's invoice page say that time was rounded and show your logged time.

Your own records are **never** changed: entries, the week and month totals, and Excel exports keep the real minutes. Timesheets you share for sign-off also show the real time.`,
  },
  {
    id: "sign-off",
    feature: "signOff",
    question: "How does a client sign off a timesheet?",
    keywords: ["approve", "approval", "client", "timesheet", "link", "pdf", "print"],
    answer: `Use **Share & export, Send to a client for sign-off**. Pick the dates, one client or project (or all), whether to include your descriptions, and how long the link works (7, 30 or 90 days).

- The client sees **hours only**: no rates and no amounts. It is a frozen copy, so what they approve is exactly what they saw.
- They type their name (and an optional note) and press **Approve**. You get an email saying so.
- They can print the page or save it as a PDF.
- You can turn a link off at any time. It then shows "isn't available any more".
- The link is shown to you **once**. Copy it when it appears.

It shows your real logged time, even if you round for invoices.`,
  },
  {
    id: "xero-quickbooks",
    feature: "accountingExport",
    question: "How do I send invoices to Xero or QuickBooks?",
    keywords: ["xero", "quickbooks", "accounting", "bookkeeping", "csv", "import", "chart of accounts"],
    answer: `Go to **Account, Your data, Send invoices to your accounting app**. Choose the format (Xero invoices, QuickBooks Online invoices, or Payments received), the year, a date format, and the settings the format needs:

- **Xero:** the **sales account code** (a Revenue account from your chart of accounts) and the **tax type** name exactly as your organisation spells it, for example \`Tax Exempt\`.
- **QuickBooks:** the **product or service** name.

Then download the CSV. In Xero, open Invoices, choose **Import** and upload it: the invoices arrive as **drafts** to approve, and Xero asks whether the amounts include tax (ours do not). In QuickBooks, use its invoice import and map the columns by name.

Before a QuickBooks import:

- The **product or service** must already exist, spelled exactly the same.
- To keep your own invoice numbers, switch on **Custom transaction numbers** in QuickBooks (Account and settings, Sales). Otherwise it numbers them itself.
- Tick **Add new customers** during the upload if the client is not in QuickBooks yet, and keep each file under 1,000 rows.
- Files with several currencies are written one currency at a time (choose it in the export).

> These files follow the apps' published import formats, but have not yet been checked against every account setup. If an import complains, send us the message (see [Where do I report a problem?](/help?a=problem)).`,
  },
  {
    id: "importing",
    feature: "importTime",
    question: "How do I import my history from Toggl, Clockify or a CSV?",
    keywords: ["toggl", "clockify", "csv", "import", "migrate", "history"],
    answer: `Go to **Account, Your data, Import from Toggl or Clockify** and choose the CSV file you exported from the other tool (the page says how to export it).

You see a **preview** before anything is saved. If dates like 03/04 could be read two ways, you are asked which one you mean. Clients and projects that do not exist yet are created for you.

Importing the **same file twice never doubles anything**: an entry already there (same project, date, time and description) is skipped.`,
  },
  {
    id: "teams",
    feature: "team",
    question: "How do I invite someone to log time on my clients?",
    keywords: ["team", "assistant", "invite", "member", "studio", "partner", "collaborator", "permissions"],
    answer: `Open **Team** (under Settings in the menu) and enter their email address, optionally a name, and tick the **clients** they may log time on. UseHourly emails them a link. It also shows you the link once, in case you prefer to send it yourself.

## What they can do

- Sign in with **their own** UseHourly account (they create one if they have none) and open the link, then press **Join the team**.
- Log time on the clients you chose, and see and delete **their own** entries.

## What they cannot see

Your rates, invoices, other clients, or anyone else's time. Their time becomes part of your books: it counts in your totals and invoices, and your lists show it marked "by" their name.

## Good to know

- The link works **once** and for **7 days**. **Send again** makes a fresh one and turns the old one off.
- You can change their clients or **Remove** them at any time. Removing keeps the entries they logged.
- This is a first version: no shared invoices or roles, and members cannot edit entries or run a timer.
- Emailing needs your own address confirmed and an account older than a day; otherwise copy the link.`,
  },
  {
    id: "ai-polish",
    feature: "aiPolish",
    question: "How do I polish descriptions with my own AI key?",
    keywords: [
      "ai",
      "anthropic",
      "claude",
      "openai",
      "chatgpt",
      "gpt",
      "polish",
      "rewrite",
      "description",
      "note",
      "key",
      "api key",
      "model",
      "privacy",
    ],
    answer: `If you have an **Anthropic (Claude)** or **OpenAI (ChatGPT)** API key, UseHourly can tidy the descriptions you type. Type a rough note and press **Polish**, on the right of the description box. The tidier version fills the box right there, and you choose **Keep** or **Undo** to put your own words back.

## Set it up

1. Get an API key from [Anthropic](https://console.anthropic.com) or [OpenAI](https://platform.openai.com). It is billed separately from a chat plan: **Claude Pro, Claude Max and ChatGPT Plus cannot be used**. A polish costs a fraction of a cent, so a few dollars of credit goes a long way.
2. Open **Account, AI assistants, Polish descriptions with your own AI key**. Choose the **AI service**, check the **model**, paste the key and choose **Check and save**.

The **Polish** button then appears inside the right edge of description boxes: when you add time and when you edit an entry.

## Choosing a model

The first model in each list is the cheapest, and it is plenty for tidying a sentence. A bigger one is slower and costs more without making this job better. You can change the model later on the same Account card without entering the key again, or choose **Other model…** and type a model name as the service lists it. A key is checked with one tiny call when you save it, and a new model is checked the same way before it is used, so you see "Checked" or a plain reason it failed.

## What is sent, and where the key lives

- The key stays **in this browser only**. UseHourly never sees it: your browser talks to the service directly. It is forgotten when you sign out, and you can remove it any time on the same Account card. On another device, save it again.
- Only the **description** and the **project and client names** are sent. Never rates, amounts, invoices or other entries.
- The polished line stays in your own words, kept short and told to add nothing. Read it before you keep it; typing in the box also keeps it, and nothing is saved until you add or save the entry.

If you would rather drive UseHourly from an assistant you already use, see [Connecting an AI assistant](/help?a=connect-assistant): that needs no key.`,
  },
  {
    id: "friday-reminder",
    feature: "weeklyReminder",
    question: "Can UseHourly remind me to log my hours?",
    keywords: ["reminder", "email", "weekly", "notification", "unsubscribe"],
    answer: `Under **Account**, tick **Email me on Friday afternoon with my week so far**. It needs a confirmed email address.

One email arrives each Friday from about 4 pm **your** time, with your week so far, so nothing goes unlogged. Turn it off in the same place, or with the link in any of the emails.`,
  },
  {
    id: "team",
    feature: "team",
    question: "Can more than one person use it?",
    keywords: ["team", "employees", "studio", "share", "multi user"],
    answer: `In a first version, yes: you can invite someone to log time on the clients you choose. Invoices stay yours alone. See [Inviting someone](/help?a=teams).`,
  },
  {
    id: "expenses",
    feature: "expenses",
    question: "Can I record expenses and mileage?",
    keywords: ["expenses", "mileage", "miles", "receipts", "costs", "spending", "deductions", "net income"],
    answer: `Yes, on the **Year summary**. Open the **Expenses** section and press **Add expense**.

- **Expense:** the date, the amount, a category (software, equipment, travel and so on), an optional client and a note.
- **Mileage:** the distance in miles or km and a rate per mile or km. The rate starts at 0.70, the IRS rate for 2025: change it to the rate for your year or country. UseHourly works out the amount.

The section adds the year up by category and by quarter, and shows **Net**: payments received minus your expenses. Net is an estimate to plan with, not tax advice. **Export Excel** adds an **Expenses** sheet. Receipts are not stored: keep them yourself, and use the note to say where.`,
  },
];

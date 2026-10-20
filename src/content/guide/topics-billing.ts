import type { Topic } from "./types";

export const BILLING_TOPICS: Topic[] = [
  {
    slug: "making-an-invoice",
    title: "Making an invoice",
    group: "billing",
    summary: "What goes into an invoice, why a $0 one is blocked, and what stays fixed afterwards.",
    keywords: ["pdf", "bill", "client", "rate", "total", "number", "frozen", "edit"],
    body: `Open **Invoices** and choose **New invoice**. Pick the client and the dates (up to a year). The preview below is exactly what will be issued.

- It is built from your **billable** time for that client in those dates: one line per project, hours times the project's hourly rate.
- Days you marked non-billable and non-billable projects are left out.
- An invoice that would total **$0.00** is blocked, because a project has no hourly rate yet. Set it under Clients & Projects.
- Numbers run \`INV-<year>-001\`, \`002\` and so on.

## After you create it

The invoice is saved **exactly as issued** and a PDF downloads. Changing a rate, an entry or your business details later never changes an invoice you already made. Download the PDF again any time from the Invoices list.

Your business name, EIN, address and payment instructions come from **Account**.`,
  },
  {
    slug: "currency",
    title: "Choosing your currency",
    group: "billing",
    summary:
      "Pick the currency your rates, budgets and invoices are written in, and why it locks after your first invoice.",
    keywords: ["euro", "pound", "dollar", "money", "symbol", "eur", "gbp", "usd", "foreign", "country"],
    body: `Open **Account**, then **Invoices**, then **Currency**. Pick the currency you bill in: US dollar, euro, British pound and several others (those that use two decimals, like cents).

- It changes how amounts are **written** (the symbol and format) on rates, budgets, invoices, the invoice page your client sees, invoice emails, the year summary and Excel exports.
- **It does not convert anything.** A rate of 85 stays 85: only the symbol changes. Check your project rates after changing it.
- You can change it **until you make your first invoice**. After that it is fixed, so an account's invoices, totals, year summary and accounting export are always in one currency.
- Each invoice keeps the currency it was made in.

An invoice PDF shows the **code** (for example EUR 150.00) for currencies whose symbol its built-in font cannot draw. The invoice page and emails show the symbol.

Billing different clients in different currencies is planned, not built yet.`,
  },
  {
    slug: "rounding",
    title: "Rounding time on invoices",
    group: "billing",
    summary: "Bill in 6, 15 or 30 minute steps, with a minimum, for one client.",
    keywords: ["round up", "round", "quarter hour", "15 minutes", "minimum", "increment", "billing details"],
    body: `Some clients are billed in blocks (for example every quarter hour). Set it per client: on Clients & Projects, open the client's **Billing details** and choose:

- **Round to** none, 6, 15 or 30 minutes
- **Up** or to the **nearest** step
- A **minimum** number of minutes per entry

Each **entry** is rounded on its own, then added up. A zero stays zero. The invoice, its PDF and the client's invoice page say that time was rounded and show your logged time.

Your own records are **never** changed: entries, the week and month totals, and Excel exports keep the real minutes. Timesheets you share for sign-off also show the real time.`,
  },
  {
    slug: "paid-and-year-summary",
    title: "Marking paid and the year summary",
    group: "billing",
    summary: 'What "earned", "invoiced" and "received" mean on the Year summary.',
    keywords: ["tax", "income", "cash", "outstanding", "accountant", "taxes", "paid date", "quarter"],
    body: `On the Invoices list, use the **$** button to mark an invoice paid and pick the **date the money arrived**. The same button edits or clears it. The date matters for cash-basis taxes, so use the real one.

The **Year summary** shows, for the year you pick:

- **Earned**: billable hours times each project's **current** rate. It is what the time is worth, and it moves if you change a rate.
- **Invoiced**: invoices issued that year.
- **Received**: invoices **by the date they were paid**, including ones issued in an earlier year.
- **Outstanding**: invoices still unpaid at the end of the year.

There are tables by quarter, month, client and project, and **Export Excel** downloads it all. It is a summary of your own records, not tax advice: check it against your bank deposits before filing.`,
  },
  {
    slug: "emailing-invoices",
    title: "Sending an invoice and overdue reminders",
    group: "billing",
    summary: "Email it to your client or share a private link, and what the client sees.",
    keywords: ["email", "send", "link", "reminder", "overdue", "client email", "stop emails", "paper plane"],
    body: `On the Invoices list, the paper-plane button opens **Send**. You can do either:

- **Email it to the client.** Add their address first (Clients & Projects, client **Billing details**). The email comes from "your name via UseHourly", replies go to **you**, and it holds a private link. You can add a short note.
- **Copy a private link** and send it yourself.

The link opens a page with the invoice, a **Download PDF** button and how to pay. Choose how long it works (30, 90 or 180 days). Anyone with the link can see the invoice, including your payment instructions, so keep lifetimes short.

## Overdue reminders

Tick the reminders box when you send. If the invoice has a due date and is unpaid, the client gets a reminder a day after it is due and another a week later. Marking it paid stops them.

## Limits and opting out

To protect everyone's email, you must have confirmed your own address, and new accounts can email after their first day. There are daily limits. Every email has a link for the client to **stop all emails**, after which nobody can email that address through UseHourly.`,
  },
];

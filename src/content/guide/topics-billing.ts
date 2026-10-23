import { feature } from "@/lib/features";

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
- ${feature("nonBillableDays") ? "Days you marked non-billable and non-billable projects are" : "Non-billable projects are"} left out.
- An invoice that would total **$0.00** is blocked, because a project has no hourly rate yet. Set it under Clients.
- Numbers run \`INV-<year>-001\`, \`002\` and so on.

## After you create it

The invoice is saved **exactly as issued** and a PDF downloads. Changing a rate, an entry or your business details later never changes an invoice you already made. Download the PDF again any time from the Invoices list.

Your business name, EIN, address and payment instructions come from **Account**.`,
  },
  {
    slug: "currency",
    title: "Choosing your currency",
    group: "billing",
    summary: feature("clientCurrency")
      ? "Pick your usual currency, bill a client in a different one, and why each locks after its first invoice."
      : "Pick the currency you bill in, and why it locks after your first invoice.",
    keywords: [
      "client",
      "multiple",
      "euro",
      "pound",
      "dollar",
      "money",
      "symbol",
      "eur",
      "gbp",
      "usd",
      "foreign",
      "country",
    ],
    body: `Open **Account**, then **Invoices**, then **Currency**. Pick the currency you bill in: US dollar, euro, British pound and several others (those that use two decimals, like cents).

- It changes how amounts are **written** (the symbol and format) on rates, ${feature("budgets") ? "budgets, " : ""}invoices, the invoice page your client sees, ${feature("invoiceEmail") ? "invoice emails, " : ""}the year summary and Excel exports.
- **It does not convert anything.** A rate of 85 stays 85: only the symbol changes. Check your project rates after changing it.
- You can change it **until you make your first invoice**. After that it is fixed.${feature("clientCurrency") ? " It is the currency of every client that does not have one of its own." : ""}
- Each invoice keeps the currency it was made in.
${
  feature("clientCurrency")
    ? `
**Billing one client in another currency:** on **Clients**, open **Billing details** for that client and pick its **Currency**. Its rates, budgets and invoices are then written in it, and the client's currency is fixed once you have made an invoice for it.

- **Totals are never added across currencies.** The Invoices page shows one set of figures per currency, and the **Year summary** shows one currency at a time (a currency picker appears when you use more than one).
- The **accounting export** asks which currency to write, because its files hold plain numbers.
`
    : ""
}
An invoice PDF shows the **code** (for example EUR 150.00) for currencies whose symbol its built-in font cannot draw. The invoice page${feature("invoiceEmail") ? " and emails show" : " shows"} the symbol.`,
  },
  {
    slug: "rounding",
    title: "Rounding time on invoices",
    group: "billing",
    feature: "rounding",
    summary: "Bill in 6, 15 or 30 minute steps, with a minimum, for one client.",
    keywords: ["round up", "round", "quarter hour", "15 minutes", "minimum", "increment", "billing details"],
    body: `Some clients are billed in blocks (for example every quarter hour). Set it per client: on the Clients page, open the client's **Billing details** and choose:

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
    keywords: ["tax", "income", "cash", "outstanding", "accountant", "taxes", "paid date", "quarter", "email", "send"],
    body: `On the Invoices list, use the **$** button to mark an invoice paid and pick the **date the money arrived**. The same button edits or clears it. The date matters for cash-basis taxes, so use the real one.

The **Year summary** shows, for the year you pick:

- **Earned**: billable hours times each project's **current** rate. It is what the time is worth, and it moves if you change a rate.
- **Invoiced**: invoices issued that year.
- **Received**: invoices **by the date they were paid**, including ones issued in an earlier year.
- **Outstanding**: invoices still unpaid at the end of the year.

There are tables by quarter, month, client and project, and **Export Excel** downloads it all.${
      feature("reportEmail")
        ? " **Email me this** sends the figures to your own email address (once it is confirmed on Account), for example to forward to your accountant. It only ever goes to you, and up to five times a day."
        : ""
    } It is a summary of your own records, not tax advice: check it against your bank deposits before filing.`,
  },
  {
    slug: "emailing-invoices",
    title: feature("invoiceEmail")
      ? "Sending an invoice and overdue reminders"
      : "Sharing an invoice with a private link",
    group: "billing",
    summary: feature("invoiceEmail")
      ? "Email it to your client or share a private link, and what the client sees."
      : "Send your client a private link to the invoice, and what the client sees.",
    keywords: ["email", "send", "link", "reminder", "overdue", "client email", "stop emails", "paper plane"],
    body: feature("invoiceEmail")
      ? `On the Invoices list, the paper-plane button opens **Send**. You can do either:

- **Email it to the client.** Add their address first (the Clients page, client **Billing details**). The email comes from "your name via UseHourly", replies go to **you**, and it holds a private link. You can add a short note.
- **Copy a private link** and send it yourself.

The link opens a page with the invoice, a **Download PDF** button and how to pay. Choose how long it works (30, 90 or 180 days). Anyone with the link can see the invoice, including your payment instructions, so keep lifetimes short.

## Overdue reminders

Tick the reminders box when you send. If the invoice has a due date and is unpaid, the client gets a reminder a day after it is due and another a week later. Marking it paid stops them.

## Limits and opting out

To protect everyone's email, you must have confirmed your own address, and new accounts can email after their first day. There are daily limits. Every email has a link for the client to **stop all emails**, after which nobody can email that address through UseHourly.`
      : `On the Invoices list, the paper-plane button opens **Send**. Choose how long the link works (30, 90 or 180 days), copy the private link, and send it to your client yourself, for example in your own email.

The link opens a page with the invoice, a **Download PDF** button and how to pay. Anyone with the link can see the invoice, including your payment instructions, so keep lifetimes short.`,
  },
];

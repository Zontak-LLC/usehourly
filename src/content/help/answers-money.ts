import { feature } from "@/lib/features";

import type { Answer } from "./types";

/** Invoices and money: found by searching. */
export const MONEY_ANSWERS: Answer[] = [
  {
    id: "rate",
    question: "Where do I set my hourly rate?",
    keywords: ["price", "charge", "per hour", "hourly", "money", "no hourly rate"],
    answer: `Open **Clients** and press **Edit** on the project. Set the **Hourly rate** (drag the slider or type it) and press **Save**.

Each project has its own rate, so one client can pay different rates for different work. A changed rate counts for invoices you make from now on; invoices you already made keep their amounts.`,
  },
  {
    id: "billed-twice",
    question: "Can the same hours end up on two invoices?",
    keywords: ["twice", "double", "duplicate", "already invoiced", "not invoiced yet", "unbilled", "again"],
    answer: `Not by accident. Every hour remembers the invoice it was billed on, and a new invoice takes only time that is **not invoiced yet**. Clients shows how much that is for each client.

If the dates you pick hold time that is already on an invoice, the builder says so and leaves it out. To bill it again on purpose (for example, the first invoice was lost), tick **Bill it again anyway**.

If you delete an invoice, its time becomes "not invoiced yet" again.`,
  },
  {
    id: "invoice-schedule",
    question: "Can UseHourly remind me when it is time to invoice a client?",
    keywords: [
      "schedule",
      "monthly",
      "every month",
      "every 2 weeks",
      "biweekly",
      "due",
      "remind",
      "recurring",
      "period",
    ],
    answer: `Yes. Open **Clients**, pick the client, open **Billing details** and set **Invoice this client** to **Every month** or **Every 2 weeks** (for two weeks, pick the first day of the first period). Press **Save**.

When a period is over and its time is not invoiced yet, **Invoices** and the client's page say so, for example "October invoice for Acme is due · 12:30 h · $1,250.00". **Make invoice** opens a new invoice for exactly that period. Once an invoice covers the period, the note goes away.

Every month means the whole calendar month before, due on the 1st. Nothing is sent by UseHourly and nothing is made without you.`,
  },
  {
    id: "overdue-reminder",
    question: "How do I remind a client about a late invoice?",
    keywords: ["overdue", "late", "unpaid", "remind", "reminder", "chase", "follow up", "nudge"],
    answer: `Open **Invoices** and choose **Overdue**. On the late invoice, press the bell (**Write a reminder**). A polite email opens under the invoice, with the amount, how many days late it is and a private link to the invoice. Change the words if you like, then press **Open in my email app** and send it from there.

UseHourly never sends the reminder itself. To send the invoice email again instead, use the **···** menu on the invoice.`,
  },
  {
    id: "invoice-link",
    oldSlugs: ["emailing-invoices"],
    question: "How do I email an invoice to my client, and what do they see?",
    keywords: [
      "share",
      "link",
      "send",
      "email",
      "mail",
      "gmail",
      "outlook",
      "attach",
      "client",
      "private",
      "url",
      "expire",
    ],
    answer: `On the Invoices list, press **Send** (the envelope) on the invoice. An email to your client opens under it, ready to edit: the amount, the dates, when it is due and a private link to the invoice. The **To** address comes from the client's **Billing details** on Clients.

- **Open in my email app** opens a new email in Gmail, Outlook, Apple Mail or your usual app, with everything filled in. Check it and press Send there. UseHourly never sends it for you.
- **Copy message** is for webmail in another tab: paste it into a new email.
- **Share with the PDF** (on a phone, and Safari on a Mac) attaches the PDF file itself. Elsewhere, press **Download PDF** and attach it by hand.

The link opens a page with the invoice, a **Download PDF** button and how to pay you. It works for 90 days. Anyone with the link can see it, including your payment details. To stop a link, press **Turn off** beside it under the email.`,
  },
  {
    id: "paid",
    oldSlugs: ["paid-and-year-summary"],
    question: "How do I mark an invoice paid?",
    keywords: ["paid", "payment", "received", "money arrived", "unpaid", "overdue", "waiting"],
    answer: `On the Invoices list, press **Mark paid** and pick the **date the money arrived**. The date matters for cash-basis taxes, so use the real one.

To change or clear it later, open **···** on the invoice and choose **Edit payment**. The tabs at the top (Waiting, Overdue, Paid) sort your invoices by what still needs doing.`,
  },
  {
    id: "year-summary",
    question: "What do Earned, Invoiced and Received mean on the Year summary?",
    keywords: ["tax", "taxes", "income", "cash", "outstanding", "accountant", "quarter", "annual", "report"],
    answer: `The **Year summary** shows, for the year you pick:

- **Earned**: billable hours times each project's **current** rate. It is what the time is worth, and it moves if you change a rate.
- **Invoiced**: invoices made that year.
- **Received**: invoices **by the date they were paid**, also ones made in an earlier year.
- **Outstanding**: invoices still unpaid at the end of the year.

There are tables by quarter, month, client and project, and **Export Excel** downloads it all. It sums up your own records and is not tax advice: check it against your bank before you file.`,
  },
  {
    id: "business-details",
    question: "How do I put my business name, address and logo on invoices?",
    keywords: ["company", "ein", "tax id", "logo", "address", "payment instructions", "bank", "from", "client address"],
    answer: `Your own details are on **Account**, **Invoices**: business name, EIN, address, logo and how to pay you. They print on every invoice you make from then on.

Your **client's** name, address and logo are on **Clients**: open **···** on the client and choose **Billing details**.`,
  },
  {
    id: "currency",
    question: "How do I bill in euros or another currency?",
    keywords: ["euro", "pound", "dollar", "eur", "gbp", "usd", "cad", "symbol", "foreign", "money"],
    answer: `Open **Account**, **Invoices**, then **Currency**, and pick the one you bill in.

- It changes how amounts are **written** (the symbol and format). **Nothing is converted**: a rate of 85 stays 85.
- You can change it until you make your **first invoice**. After that it is fixed, so totals never mix two currencies.
- A PDF shows the code (for example EUR 150.00) for a symbol its font cannot draw.`,
  },
  {
    id: "does-it-round",
    question: "Does it round my time?",
    keywords: ["round up", "rounding", "increments", "15 minutes", "quarter hour", "minimum"],
    answer: feature("rounding")
      ? `Your own records are never rounded. Only a stopped timer is counted up to the next whole minute. For invoices you can choose rounding per client: see [Rounding time on invoices](/help?a=invoice-rounding).`
      : `No. Invoices bill the exact minutes you logged. Only a stopped timer is counted up to the next whole minute, and you can still correct it with − or + 5 min right after you stop.`,
  },
];

import type { Topic } from "./types";

export const SHARING_TOPICS: Topic[] = [
  {
    slug: "share-and-export",
    title: "Share & export: which option do I use?",
    group: "sharing",
    summary: "Excel, a date range, everything at once, or a timesheet your client can approve.",
    keywords: ["excel", "csv", "download", "export", "range", "zip", "backup", "spreadsheet"],
    body: `On Week and Month the **Share & export** menu has three choices:

- **Download as Excel** gives the week or month you are looking at.
- **Export a date range** lets you pick any dates (up to a year), such as "March 3 to April 20".
- **Send to a client for sign-off** makes a timesheet link (see [Client sign-off timesheets](/help/sign-off)).

To take **everything** with you (all clients, all time), use **Account, Your data, Download everything**. It is a zip with one combined workbook, one workbook per client, and plain CSV files.

Excel files have the hours as numbers with live totals. Time on days you marked non-billable is left out of exports (see [Non-billable days](/help/non-billable)).`,
  },
  {
    slug: "sign-off",
    title: "Client sign-off timesheets",
    group: "sharing",
    summary: "Send hours to a client to review and approve, without showing money.",
    keywords: ["approve", "approval", "client", "timesheet", "link", "pdf", "print"],
    body: `Use **Share & export, Send to a client for sign-off**. Pick the dates, one client or project (or all), whether to include your descriptions, and how long the link works (7, 30 or 90 days).

- The client sees **hours only**: no rates and no amounts. It is a frozen copy, so what they approve is exactly what they saw.
- They type their name (and an optional note) and press **Approve**. You get an email saying so.
- They can print the page or save it as a PDF.
- You can turn a link off at any time. It then shows "isn't available any more".
- The link is shown to you **once**. Copy it when it appears.

It shows your real logged time, even if you round for invoices.`,
  },
  {
    slug: "xero-quickbooks",
    title: "Sending invoices to Xero or QuickBooks",
    group: "sharing",
    summary: "Download a file your accounting app can import.",
    keywords: ["xero", "quickbooks", "accounting", "bookkeeping", "csv", "import", "chart of accounts"],
    body: `Go to **Account, Your data, Send invoices to your accounting app**. Choose the format (Xero invoices, QuickBooks Online invoices, or Payments received), the year, a date format, and the settings the format needs:

- **Xero:** the **sales account code** (a Revenue account from your chart of accounts) and the **tax type** name exactly as your organisation spells it, for example \`Tax Exempt\`.
- **QuickBooks:** the **product or service** name.

Then download the CSV. In Xero, open Invoices, choose **Import** and upload it: the invoices arrive as **drafts** to approve, and Xero asks whether the amounts include tax (ours do not). In QuickBooks, use its invoice import and map the columns by name.

Before a QuickBooks import:

- The **product or service** must already exist, spelled exactly the same.
- To keep your own invoice numbers, switch on **Custom transaction numbers** in QuickBooks (Account and settings, Sales). Otherwise it numbers them itself.
- Tick **Add new customers** during the upload if the client is not in QuickBooks yet, and keep each file under 1,000 rows.
- Files with several currencies are written one currency at a time (choose it in the export).

> These files follow the apps' published import formats, but have not yet been checked against every account setup. If an import complains, send us the message (see [Where do I report a problem?](/help/faq#problem)).`,
  },
  {
    slug: "importing",
    title: "Importing from Toggl, Clockify or a CSV",
    group: "sharing",
    summary: "Bring your history in, and why importing twice is safe.",
    keywords: ["toggl", "clockify", "csv", "import", "migrate", "history"],
    body: `Go to **Account, Your data, Import from Toggl or Clockify** and choose the CSV file you exported from the other tool (the page says how to export it).

You see a **preview** before anything is saved. If dates like 03/04 could be read two ways, you are asked which one you mean. Clients and projects that do not exist yet are created for you.

Importing the **same file twice never doubles anything**: an entry already there (same project, date, time and description) is skipped.`,
  },
];

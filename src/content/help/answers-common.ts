import { feature } from "@/lib/features";

import type { Answer } from "./types";

/** The questions people ask most: the Help page shows these before anything is typed. */
export const COMMON_ANSWERS: Answer[] = [
  {
    id: "free",
    common: true,
    question: "Is UseHourly really free?",
    keywords: ["price", "cost", "pay", "subscription", "upgrade", "trial", "plan", "ads", "donate", "sponsor"],
    answer: `Yes. There is **one version** with every feature in it. There are no paid plans, no locked features, no upgrade prompts and no ads.

Hosting costs the maker a few dollars a month, which they pay. If UseHourly saves you time, you can chip in through GitHub Sponsors (the **Support UseHourly** link at the foot of the home page). That is optional.`,
  },
  {
    id: "connect-assistant",
    common: true,
    oldSlugs: ["ai-assistants"],
    question: "How do I connect Claude, ChatGPT, Cursor or another AI app?",
    keywords: [
      "ai",
      "assistant",
      "mcp",
      "claude code",
      "connector",
      "token",
      "api key",
      "api token",
      "oauth",
      "automation",
    ],
    answer: `Open **Account**, then **API tokens & AI**, and pick your assistant. You get two or three short steps, each with a direct link:

- **Claude:** add a custom connector with the address \`https://usehourly.app/api/mcp\`, then log in to UseHourly and approve.
- **ChatGPT:** turn on Developer mode, create a connector with the same address, pick **OAuth**, then log in and approve. Your ChatGPT plan must allow custom connectors.
- **Cursor:** press **Add to Cursor**, then **Install**, then log in and approve.
- **Claude Code:** run \`claude mcp add --transport http usehourly https://usehourly.app/api/mcp\`, type \`/mcp\` and approve in your browser.
- **VS Code:** press **Add to VS Code**, then **Install**, then log in and approve.
- **Devin Desktop (formerly Windsurf)** or **any other app** that supports MCP: add a remote (HTTP) server with the same address, then log in and approve.

When you approve, choose **Read only** (it can look at your time and invoices) or **Read and change** (it can also log time and make invoices). Then say things like "log 1h30 on Acme for yesterday" or "what did I log last week?". The assistant asks you before it deletes anything or makes an invoice.

For an app that wants a token instead, make one under **API tokens** on the same page. It is shown once. Changing your password or **Log out on all devices** stops every token.`,
  },
  {
    id: "phone",
    common: true,
    oldSlugs: ["install-on-phone", "app"],
    question: "Can I use it on my phone, and offline?",
    keywords: [
      "iphone",
      "android",
      "mobile",
      "app",
      "app store",
      "home screen",
      "install",
      "ios",

      "internet",
    ],
    answer: `Yes. UseHourly is a website that works on any phone. There is no app-store app, but you can add it to your home screen and it opens like one, straight to Today:

- **iPhone (Safari):** tap **Share**, then **Add to Home Screen**.
- **Android (Chrome):** open the menu (three dots), then **Install app** or **Add to Home screen**.

With no connection you can still open the pages you have opened before and add time. The time is kept on your phone and sent once you are back online. See [Working offline](/help?a=offline).`,
  },
  {
    id: "data",
    common: true,
    oldSlugs: ["delete-account", "export"],
    question: "Can I get my data out, or delete my account?",
    keywords: [
      "download",
      "export",
      "backup",
      "leave",
      "lock in",
      "csv",
      "excel",
      "zip",
      "delete",
      "close account",
      "gdpr",
      "remove",
    ],
    answer: `**Take it with you** any time: open **Account**, **Your data**, then **Download everything**. You get a zip with all your clients, entries and invoices as spreadsheets and plain CSV files.

**Delete account** is on **Account**, **Profile**. If you sign in with a password you confirm with it; if you sign in with Google or GitHub you type your email address. Then slide the handle all the way to the right (or press End on the keyboard); let go early and nothing happens. Your clients, projects, entries, invoices, links and tokens are removed **straight away**, and this cannot be undone. Backups held by the hosting provider age out within 30 days.

The code is open source (MIT), so you can also run your own copy.`,
  },
  {
    id: "privacy",
    common: true,
    question: "Who can see my data?",
    keywords: ["private", "security", "safe", "sell", "analytics", "tracking", "cookies"],
    answer: `Only you. Every account is separate, and your data is not sold or used for ads. ${
      feature("team") ? "A team member sees only the clients you grant, and a client sees" : "A client sees"
    } only a link you chose to share. An assistant you connect sees only your own data, and never your password.

The maker counts page views per day, with no names and no cookies, to learn which parts get used. See the [privacy page](/privacy).`,
  },
  {
    id: "invoice",
    common: true,
    oldSlugs: ["making-an-invoice"],
    question: "How do I make an invoice and send it?",
    keywords: ["bill", "billing", "pdf", "client", "charge", "new invoice", "send", "number", "due date"],
    answer: `On **Clients**, a client with time to bill shows "$X not invoiced yet" and a **Make invoice** button. You can also open **Invoices** and press **+** (New invoice).

1. Check the client and the dates. The builder starts on the time that is not invoiced yet.
2. Pick when it is due (On receipt, Net 15, Net 30 and so on). The invoice number is under **More options**.
3. Press **Create invoice**. It is saved and the PDF downloads.

**To send it**, press **Send** (the envelope) on the Invoices list. You get an email to your client, ready to edit, with a private link to the invoice. Press **Open in my email app**, check it and press Send there (see [Sending an invoice](/help?a=invoice-link)).

The invoice is built from your **billable** time for that client: one line per project, hours times the project's hourly rate. An invoice that would total $0.00 is blocked, because a project has no rate yet. Once made, the invoice never changes, even if you edit a rate or an entry later.`,
  },
];

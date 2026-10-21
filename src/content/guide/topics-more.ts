import type { Topic } from "./types";

export const MORE_TOPICS: Topic[] = [
  {
    slug: "offline",
    title: "Working offline",
    group: "everywhere",
    summary: "What keeps working with no connection, what is saved for later, and what needs to be online.",
    keywords: ["no internet", "no connection", "airplane", "train", "sync", "wifi", "saved on this device"],
    body: `UseHourly keeps working when your connection drops or you have none.

## What works offline

- **Opening the app** shows the pages you have already opened and the data you last saw. A page you have never opened shows a short "You're offline" page.
- **Adding time.** Type it as usual. A banner says "You're offline" and "N saved on this device". The entry is kept on your device and sent **once** when the connection returns (it never creates a copy). You can also press **Try again**.

## What needs a connection

Timers, editing an entry, moving, merging and deleting, invoices, exports and everything on the Account page. A message says so instead of failing silently.

## Good to know

- Waiting entries belong to your account and stay on this device until they are sent, even if you sign out. You can discard one from the banner.
- Signing out removes the saved pages and the saved copy of your data from the device, so nothing of yours stays on a shared computer.
- If an entry is refused when it is sent (for example its project was deleted meanwhile), it stays in the list marked, so you can see it and discard it.`,
  },
  {
    slug: "install-on-phone",
    title: "Put UseHourly on your phone",
    group: "everywhere",
    summary: "Add it to your home screen so it opens like an app.",
    keywords: ["iphone", "android", "home screen", "app", "install", "pwa", "ios"],
    body: `There is no app store download. UseHourly is a website that you can add to your home screen, where it opens full screen straight to Today.

- **iPhone (Safari):** tap the **Share** button, then **Add to Home Screen**.
- **Android (Chrome):** open the menu (three dots), then **Install app** or **Add to Home screen**.

It also keeps working offline (see [Working offline](/help/offline)). Phones show the main pages as a bar along the bottom.`,
  },
  {
    slug: "menu-position",
    title: "Moving the menu to the left, and colours",
    group: "everywhere",
    summary: "Choose a side menu on a wide screen, and a colour that suits you.",
    keywords: ["navigation", "sidebar", "layout", "theme", "dark mode", "colour", "color", "appearance"],
    body: `Click the **gear** at the top right (Appearance and layout).

- **Navigation: Top or Left** (wide screens only). Left puts every page in a side menu, grouped under Track, Bill, Manage and Settings. The current page has a marker beside it. Your name, picture and Log out are in the top bar.
- **Theme Preset** picks the accent colour, and **Theme Mode** is light, dark or follows your computer.

Your colour choice follows your account to other devices. The menu position is saved in this browser only. Phones always keep the bottom bar.`,
  },
  {
    slug: "teams",
    title: "Inviting someone to log time on your clients",
    group: "team",
    summary: "What a team member can and cannot see, and how to remove them.",
    keywords: ["team", "assistant", "invite", "member", "studio", "partner", "collaborator", "permissions"],
    body: `Open **Team** (under Settings in the menu) and enter their email address, optionally a name, and tick the **clients** they may log time on. UseHourly emails them a link. It also shows you the link once, in case you prefer to send it yourself.

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
    slug: "ai-assistants",
    title: "Connecting an AI assistant (Claude, Cursor)",
    group: "team",
    summary: "Let an assistant log your time and make invoices, with the access you choose.",
    keywords: ["claude", "mcp", "cursor", "chatgpt", "token", "assistant", "automation", "oauth", "api"],
    body: `UseHourly has a built-in connection for AI assistants that speak MCP (Claude, Cursor and others). You can say "log 2 hours on Acme for yesterday" and it happens.

If you work in an AI assistant all day, this lets you manage your timesheets right from there, without opening UseHourly.

## Things you can say

- "Log 1h30 on Acme / Website for fixing the checkout bug."
- "What did I log last week? Anything missing?"
- "Show my timesheet for Acme for last week" (a grid of projects and days, with the weekdays that have nothing logged).
- "Make a link for Acme's client to sign off last week's timesheet." It asks whether to include your descriptions and how long the link should work, then creates a private page your client can read, print and approve. The link is shown once, so copy it.
- "Prepare an invoice for Acme for September." It lists the time and the amounts first, and waits for your OK before it makes the invoice.

## Connect

- **Claude Code:** run \`claude mcp add --transport http usehourly https://usehourly.app/api/mcp\`, then type \`/mcp\`, choose usehourly and approve in your browser.
- **Other apps:** create a token under **Account, AI assistants** and paste it where the app asks for a bearer token.

## Choose how much it may do

- **Read only** lets it look at your time, clients and invoices. It is pre-selected when you approve.
- **Read and change** also lets it add and edit time, start timers and make invoices. It is told to ask you before it deletes anything or makes an invoice.

Tokens can expire. A token stops working when you change your password or choose **Log out on all devices**, and you can revoke any of them under Account. The assistant only ever sees **your** data, and never your password, tokens or email address.`,
  },
  {
    slug: "ai-polish",
    title: "Polishing descriptions with your own AI key",
    group: "team",
    summary: "Turn a rough note into a clear line with your own Anthropic or OpenAI key, and what is sent.",
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
    body: `If you have an **Anthropic (Claude)** or **OpenAI (ChatGPT)** API key, UseHourly can tidy the descriptions you type. Type a rough note and press **Polish**, on the right of the description box. The tidier version fills the box right there, and you choose **Keep** or **Undo** to put your own words back.

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

If you would rather drive UseHourly from an assistant you already use, see [Connecting an AI assistant](/help/ai-assistants): that needs no key.`,
  },
  {
    slug: "archive",
    title: "Archiving clients and projects",
    group: "account",
    summary: "Hide finished work from the pickers without losing its history.",
    keywords: ["archive", "hide", "finished", "old client", "unarchive", "restore"],
    body: `On the Clients page, the archive button on a client or project hides it from the project pickers so your day stays tidy. Its history stays: old entries, invoices and the year summary still include it.

Open **Archived clients and projects** at the bottom of the page to bring one back.`,
  },
  {
    slug: "demo-account",
    title: "The sample-data demo",
    group: "account",
    summary: "What the demo is, and how to keep your work when you make a real account.",
    keywords: ["demo", "sample", "try", "trial", "without signing up"],
    body: `**Try it with sample data** gives you a real, throwaway account with example clients, entries and invoices, with no sign-up. It is deleted after **24 hours**.

To keep it, open **Account** and choose **Keep your work: create a free account**. You can either **start fresh** (the sample data is removed and your account is empty) or **keep everything** in the demo, including anything you added.

A demo cannot email invoices, share links, invite people or connect an assistant: those need a real account.`,
  },
  {
    slug: "friday-reminder",
    title: "The Friday reminder email",
    group: "account",
    summary: "An optional weekly nudge to log your hours.",
    keywords: ["reminder", "email", "weekly", "notification", "unsubscribe"],
    body: `Under **Account**, tick **Email me on Friday afternoon with my week so far**. It needs a confirmed email address.

One email arrives each Friday from about 4 pm **your** time, with your week so far, so nothing goes unlogged. Turn it off in the same place, or with the link in any of the emails.`,
  },
  {
    slug: "delete-account",
    title: "Taking your data out, or deleting your account",
    group: "account",
    summary: "Download everything first; deleting removes your data straight away.",
    keywords: ["delete account", "remove my data", "export", "privacy", "gdpr", "leave", "close account"],
    body: `**Take it with you.** Under **Account, Your data**, **Download everything** gives a zip of all your clients, entries and invoices as spreadsheets and plain CSV files.

**Delete your account** is under **Account, Your data**. If you sign in with a password you confirm with it; if you sign in with Google or GitHub you type your email address. Deleting removes your clients, projects, entries, invoices, links and tokens **straight away**, and cannot be undone. Backups held by the hosting provider age out within 30 days.

If you were invited to someone's team, leaving or deleting does not remove the entries you logged for them: those belong to their books.`,
  },
];

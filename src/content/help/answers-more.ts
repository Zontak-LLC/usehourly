import { feature } from "@/lib/features";

import type { Answer } from "./types";

/** Exports, devices and the account: found by searching. */
export const MORE_ANSWERS: Answer[] = [
  {
    id: "find",
    question: "How do I find an old entry, invoice or setting?",
    keywords: ["search", "find", "look up", "ctrl k", "cmd k", "where is", "setting", "lost"],
    answer: `Use the search in the top bar, or press **Ctrl K** (**⌘ K** on a Mac). Type a few words: it finds pages, settings, clients and projects, entries by their description, and invoices. Choose a result to go straight there.`,
  },
  {
    id: "excel",
    oldSlugs: ["share-and-export"],
    question: "How do I export my hours to Excel?",
    keywords: ["export", "excel", "spreadsheet", "xlsx", "download", "date range", "timesheet", "csv"],
    answer: `On **Week** or **Month**, press **Export**:

- **Download this week** (or month) **as Excel** gives the period you are looking at.
- **Export a date range…** lets you pick any dates, up to a year, such as "March 3 to April 20".

The files have the hours as numbers with live totals, and a sheet with every entry. To take everything at once, see [Getting your data out](/help?a=data).`,
  },
  {
    id: "importing",
    feature: "importTime",
    question: "How do I move my history over from Toggl, Clockify or Harvest?",
    keywords: ["toggl", "clockify", "harvest", "csv", "import", "migrate", "move", "switch", "history"],
    answer: `Open **Account**, **Your data**, and find **Move here in two minutes**. Choose where your time is now (**Toggl Track**, **Clockify**, **Harvest** or **Other CSV**): the page shows the two or three steps to export the file from that app. Then press **Choose the CSV file**.

You see a **preview** before anything is saved: how many entries, the dates they cover, how many clients and projects are new, and how many entries are already here. If dates like 03/04 could be read two ways, you are asked which one you mean. Press **Import** to add them.

- Clients and projects that do not exist yet are created for you. A new project takes the **hourly rate** and the **billable** setting from the file when it has them; a project you already have is never changed.
- Harvest gives hours as decimals (1.33): they become whole minutes (1:20).
- Importing the **same file twice never doubles anything**: an entry already there (same project, date, time and description) is skipped.

The file is read in your browser; only the entries go to UseHourly.`,
  },
  {
    id: "offline",
    oldSlugs: ["offline-safe"],
    question: "What works offline, with no connection?",
    keywords: ["offline", "no internet", "airplane", "train", "sync", "wifi", "saved on this device", "lost"],
    answer: `UseHourly keeps working when your connection drops.

- **Pages you opened before** still open, with the data you last saw.
- **Adding time** works. A banner says "You're offline", the entry is kept on your device and it is sent **once** when you are back online, without making a copy. Once you are back online, **Try again** sends it at once.

Timers, editing and deleting entries, invoices, exports and the Account page need a connection. A message says so.

Signing out removes the saved pages and data from the device. Time still waiting to be sent stays for your account until it is sent.`,
  },
  {
    id: "dark-mode",
    oldSlugs: ["menu-position"],
    question: "How do I switch to dark mode?",
    keywords: ["theme", "dark", "light", "night", "colour", "color", "appearance"],
    answer: feature("appearanceExtras")
      ? "Press the **gear** at the top right and pick **Light**, **Dark**, or **System** to follow your computer or phone. Your choice follows your account to your other devices. The same menu moves the page menu to the left on a wide screen."
      : "Press the **moon** button at the top right: the app turns dark. Press it again (it is a sun then) for light. You can also search for **dark mode** and choose it. Your choice follows your account to your other devices.",
  },
  {
    id: "archive",
    question: "How do I hide a client or project I no longer work for?",
    keywords: ["archive", "hide", "finished", "old client", "unarchive", "restore", "remove client"],
    answer: `**Archive** it. On **Clients**, open **···** on the client and choose **Archive client**; for one project, press **Edit** and choose **Archive project**. It leaves the project pickers, but its old entries and invoices stay, and the Year summary still counts them.

To bring one back, open **···** at the top of the Clients page and choose **Archived clients and projects**.`,
  },
  {
    id: "demo-account",
    oldSlugs: ["demo"],
    question: "What happens to the sample-data demo?",
    keywords: ["demo", "sample", "try", "trial", "without signing up", "keep"],
    answer: `**Try it with sample data** gives you a real account with example clients, entries and invoices, with no sign-up. It is deleted after **24 hours**.

To keep it, press **Keep your work** and create a free account. You can start fresh or keep everything in the demo, including what you added.`,
  },
  {
    id: "password",
    question: "I forgot my password. How do I get back in?",
    keywords: ["password", "reset", "log in", "sign in", "locked out", "google", "github", "change password"],
    answer: `On the log-in page, press **Forgot your password?** and type your email address. A link to set a new one arrives by email.

If you signed up with **Google** or **GitHub**, use that button: there is no password to forget. You can still set one through **Forgot your password?**.

To change your password while signed in, open **Account**, **Profile**. Changing it logs you out on your other devices.`,
  },
  {
    id: "problem",
    question: "Where do I report a problem or ask for something?",
    keywords: ["bug", "support", "contact", "feedback", "feature request", "help", "issue", "broken", "question"],
    answer: `Use **Ask a question** under **Still stuck?** at the foot of this page (you need to be signed in). Plain words are fine: say what you did and what you expected. We answer by email, to the address on your account.

If you use GitHub, you can also open an issue at [github.com/Zontak-LLC/usehourly/issues](https://github.com/Zontak-LLC/usehourly/issues). For anything private, use the contact address on the [privacy page](/privacy).`,
  },
];

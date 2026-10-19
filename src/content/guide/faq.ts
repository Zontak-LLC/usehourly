import type { FaqItem } from "./types";

export const FAQ: FaqItem[] = [
  {
    id: "free",
    question: "Is UseHourly really free?",
    keywords: ["price", "cost", "pay", "paid", "subscription", "upgrade", "trial", "freemium"],
    answer: `Yes. There is **one version** with every feature in it. There are no paid plans, no locked features, no upgrade prompts and no ads. Hosting costs the maker about $5 a month, which they pay. If it saves you time you can chip in through GitHub Sponsors (Account, Support), but that is optional.`,
  },
  {
    id: "privacy",
    question: "Who can see my data?",
    keywords: ["private", "security", "safe", "share", "sell", "analytics"],
    answer: `Only you. Every account is separate. Your data is not sold or used for ads. A team member sees only what you grant, and a client sees only a link you chose to send. The maker counts page views per day with no names and no cookies, to see which parts get used. See the [privacy page](/privacy).`,
  },
  {
    id: "export",
    question: "Can I get my data out?",
    keywords: ["download", "leave", "backup", "lock in", "export", "csv", "excel"],
    answer: `Yes, any time: **Account, Your data, Download everything** gives spreadsheets and CSV files. See [Taking your data out](/help/delete-account). The code is also open source (MIT), so you can run your own copy.`,
  },
  {
    id: "offline-safe",
    question: "What if I am offline when I add time?",
    keywords: ["internet", "lost", "connection", "sync", "lose"],
    answer: `It is saved on your device and sent once when you are back online, without making duplicates. See [Working offline](/help/offline).`,
  },
  {
    id: "app",
    question: "Is there a mobile app?",
    keywords: ["ios", "android", "iphone", "app store", "download"],
    answer: `Not an app-store app yet. You can add UseHourly to your home screen and it opens like one. See [Put UseHourly on your phone](/help/install-on-phone).`,
  },
  {
    id: "team",
    question: "Can more than one person use it?",
    keywords: ["team", "employees", "assistant", "studio", "share", "multi user"],
    answer: `In a first version, yes: you can invite someone to log time on the clients you choose. Invoices stay yours alone. See [Inviting someone](/help/teams).`,
  },
  {
    id: "rounding",
    question: "Does it round my time?",
    keywords: ["round up", "increments", "billing"],
    answer: `Never in your own records. You can choose rounding per client for invoices only. See [Rounding time on invoices](/help/rounding).`,
  },
  {
    id: "demo",
    question: "What happens to the demo?",
    keywords: ["sample", "try"],
    answer: `It is a throwaway account that is deleted after 24 hours unless you turn it into a real one. See [The sample-data demo](/help/demo-account).`,
  },
  {
    id: "problem",
    question: "Where do I report a problem or ask for something?",
    keywords: ["bug", "support", "contact", "feedback", "feature request", "help", "issue"],
    answer: `Open an issue at [github.com/Zontak-LLC/usehourly/issues](https://github.com/Zontak-LLC/usehourly/issues) (you can write plainly: no technical detail needed). Say what you did and what you expected. For anything private, use the contact address on the [privacy page](/privacy).`,
  },
];

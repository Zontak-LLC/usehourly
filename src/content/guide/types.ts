/** One guide topic: a short page about something that is easy to misunderstand. The body is a small Markdown subset (see lib/guide-markdown.ts). */
export type Topic = {
  /** The page's address: /help/<slug>. Never change one that has been published (people link to it). */
  slug: string;
  title: string;
  /** The group heading it appears under on the guide's front page. */
  group: GroupId;
  /** One sentence shown in lists and search results. */
  summary: string;
  /** Words people might type that the title does not contain ("round up", "free", "offline"). */
  keywords: string[];
  body: string;
};

export type FaqItem = { id: string; question: string; answer: string; keywords: string[] };

export const GROUPS = [
  { id: "time", title: "Logging time" },
  { id: "billing", title: "Invoices and money" },
  { id: "sharing", title: "Sharing and exporting" },
  { id: "everywhere", title: "On every device" },
  { id: "team", title: "Team and assistants" },
  { id: "account", title: "Your data and account" },
] as const;

export type GroupId = (typeof GROUPS)[number]["id"];

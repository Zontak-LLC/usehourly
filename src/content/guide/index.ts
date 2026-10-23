import { feature } from "@/lib/features";

import { FAQ as ALL_FAQ } from "./faq";
import { BILLING_TOPICS } from "./topics-billing";
import { MORE_TOPICS } from "./topics-more";
import { SHARING_TOPICS } from "./topics-sharing";
import { TIME_TOPICS } from "./topics-time";
import { type FaqItem, GROUPS, type GroupId, type Topic } from "./types";

export type { FaqItem, GroupId, Topic };
export { GROUPS };

const shown = (item: { feature?: Parameters<typeof feature>[0] }) => !item.feature || feature(item.feature);

/** Every topic written, hidden ones included, in the order the guide shows them (by group, then as written). */
export const ALL_TOPICS: Topic[] = [...TIME_TOPICS, ...BILLING_TOPICS, ...SHARING_TOPICS, ...MORE_TOPICS].sort(
  (a, b) => GROUPS.findIndex((g) => g.id === a.group) - GROUPS.findIndex((g) => g.id === b.group),
);

/** The topics this release shows: a topic about a hidden feature (lib/features.ts) is not listed, searched or served. */
export const TOPICS: Topic[] = ALL_TOPICS.filter(shown);

/** The FAQ answers this release shows. */
export const FAQ: FaqItem[] = ALL_FAQ.filter(shown);

/** A visible topic by its address (a hidden topic's page answers "not found"). */
export const topicBySlug = (slug: string) => TOPICS.find((t) => t.slug === slug);

/** Every address the guide has, so the offline keeper can fetch them all. */
/** A short fingerprint of the guide's text, so the app knows when its offline copy is out of date. */
export const GUIDE_VERSION = (() => {
  const text = TOPICS.map((t) => t.slug + t.title + t.body).join("|") + FAQ.map((f) => f.id + f.answer).join("|");
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
})();

export const GUIDE_PATHS = ["/help", "/help/faq", ...TOPICS.map((t) => `/help/${t.slug}`)];

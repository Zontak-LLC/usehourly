import { FAQ } from "./faq";
import { BILLING_TOPICS } from "./topics-billing";
import { MORE_TOPICS } from "./topics-more";
import { SHARING_TOPICS } from "./topics-sharing";
import { TIME_TOPICS } from "./topics-time";
import { type FaqItem, GROUPS, type GroupId, type Topic } from "./types";

export type { FaqItem, GroupId, Topic };
export { FAQ, GROUPS };

/** Every topic, in the order the guide shows them (by group, then as written). */
export const TOPICS: Topic[] = [...TIME_TOPICS, ...BILLING_TOPICS, ...SHARING_TOPICS, ...MORE_TOPICS].sort(
  (a, b) => GROUPS.findIndex((g) => g.id === a.group) - GROUPS.findIndex((g) => g.id === b.group),
);

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

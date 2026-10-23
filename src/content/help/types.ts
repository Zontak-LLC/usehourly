import type { Feature } from "@/lib/features";

/**
 * One answer on the Help page: a question a person would ask and a short answer in a small Markdown subset (see
 * lib/guide-markdown.ts). The page shows the `common` ones before anything is typed; every other answer is found by
 * searching.
 */
export type Answer = {
  /** Its address on the page: /help?a=<id> opens it. Never change a published one (people link to it). */
  id: string;
  question: string;
  answer: string;
  /** Words people might type that the question does not contain ("round up", "price", "iphone"). */
  keywords: string[];
  /** Shown on the Help page before anything is typed. Keep it to about six. */
  common?: true;
  /** An answer about a feature hidden in this release (lib/features.ts) is not shown or searched. */
  feature?: Feature;
  /** Addresses of the old guide (/help/<slug>) that now open this answer, so no old link breaks. */
  oldSlugs?: string[];
};

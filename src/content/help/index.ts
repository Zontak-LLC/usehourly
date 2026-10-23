import { feature } from "@/lib/features";

import { COMMON_ANSWERS } from "./answers-common";
import { HIDDEN_ANSWERS } from "./answers-hidden";
import { MONEY_ANSWERS } from "./answers-money";
import { MORE_ANSWERS } from "./answers-more";
import { TIME_ANSWERS } from "./answers-time";
import type { Answer } from "./types";

export type { Answer };

/** Every answer written, hidden ones included. */
export const ALL_ANSWERS: Answer[] = [
  ...COMMON_ANSWERS,
  ...TIME_ANSWERS,
  ...MONEY_ANSWERS,
  ...MORE_ANSWERS,
  ...HIDDEN_ANSWERS,
];

/** The answers this release shows: one about a hidden feature (lib/features.ts) is not shown or searched. */
export const ANSWERS: Answer[] = ALL_ANSWERS.filter((a) => !a.feature || feature(a.feature));

/** Where an old guide address (/help/<slug>, or an old FAQ anchor) goes now: its answer, else a search for its words. */
export function helpAddressFor(slug: string): string {
  const answer = ANSWERS.find((a) => a.id === slug) ?? ANSWERS.find((a) => a.oldSlugs?.includes(slug));
  if (answer) return `/help?a=${answer.id}`;
  const words = slug.replace(/[^a-z0-9]+/gi, " ").trim();
  return words ? `/help?q=${encodeURIComponent(words)}` : "/help";
}

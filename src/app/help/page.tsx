import type { Metadata } from "next";

import { FAQ, GROUPS, TOPICS } from "@/content/guide";

import { GuideSearch } from "./guide-search";

export const metadata: Metadata = {
  title: "Guide · UseHourly",
  description: "How to use the parts of UseHourly that are easy to misunderstand, and answers to common questions.",
};

export default function GuidePage() {
  const topics = TOPICS.map(({ slug, title, group, summary, keywords, body }) => ({
    slug,
    title,
    group,
    summary,
    keywords,
    body,
  }));
  const faq = FAQ.map(({ id, question, answer, keywords }) => ({ id, question, answer, keywords }));
  return (
    <>
      <h1 className="font-semibold text-3xl tracking-tight">Guide</h1>
      <p className="mt-2 text-muted-foreground">
        How to use the parts of UseHourly that are easy to misunderstand. The obvious things are left out.
      </p>
      <GuideSearch topics={topics} faq={faq} groups={GROUPS.map((g) => ({ ...g }))} />
    </>
  );
}

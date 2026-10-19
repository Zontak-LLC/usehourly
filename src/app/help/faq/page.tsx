import type { Metadata } from "next";

import { FAQ, TOPICS } from "@/content/guide";

import { FaqList } from "./faq-list";

export const metadata: Metadata = {
  title: "FAQ · UseHourly",
  description: "Short answers to common questions about UseHourly.",
};

export default function FaqPage() {
  return (
    <>
      <h1 className="font-semibold text-3xl tracking-tight">FAQ</h1>
      <p className="mt-2 text-muted-foreground">Short answers to the questions people ask most.</p>
      <FaqList
        faq={FAQ.map(({ id, question, answer, keywords }) => ({ id, question, answer, keywords }))}
        topics={TOPICS.map(({ slug, title, summary, keywords, body }) => ({ slug, title, summary, keywords, body }))}
      />
    </>
  );
}

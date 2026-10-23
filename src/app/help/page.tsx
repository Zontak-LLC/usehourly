import { Suspense } from "react";

import type { Metadata } from "next";

import { ANSWERS } from "@/content/help";

import { HelpCenter } from "./help-center";

export const metadata: Metadata = {
  title: "Help · UseHourly",
  description: "Short answers to common questions about UseHourly, and a search that finds the rest.",
};

export default function HelpPage() {
  const answers = ANSWERS.map((a) => ({
    id: a.id,
    question: a.question,
    answer: a.answer,
    keywords: a.keywords,
    common: Boolean(a.common),
    oldSlugs: a.oldSlugs ?? [],
  }));
  return (
    <>
      <h1 className="font-bold font-display text-4xl tracking-tight sm:text-5xl">Help</h1>
      <p className="mt-2 mb-6 text-muted-foreground">Short answers to common questions. Search finds the rest.</p>
      {/* reading the address (?a=, ?q=) needs a Suspense boundary for the static part of the page */}
      <Suspense>
        <HelpCenter answers={answers} />
      </Suspense>
    </>
  );
}

"use client";

import { useState } from "react";

import Link from "next/link";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { searchGuide } from "@/lib/guide-search";

type TopicItem = { slug: string; title: string; group: string; summary: string; keywords: string[]; body: string };
type FaqEntry = { id: string; question: string; answer: string; keywords: string[] };

/** The guide's front page: a search box that works on the device (so also offline), then the topics by group. */
export function GuideSearch({
  topics,
  faq,
  groups,
}: {
  topics: TopicItem[];
  faq: FaqEntry[];
  groups: { id: string; title: string }[];
}) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const topicHits = searchGuide(
    topics.map((t) => ({ ...t, id: t.slug })),
    q,
  );
  const faqHits = searchGuide(
    faq.map((f) => ({ id: f.id, title: f.question, summary: "", keywords: f.keywords, body: f.answer })),
    q,
  );

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the guide: try “round”, “offline” or “free”"
          aria-label="Search the guide"
          className="h-11 pl-9 text-base"
        />
      </div>

      {q ? (
        <section aria-live="polite" className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            {topicHits.length + faqHits.length === 0
              ? "Nothing matches that. Try a different word, or browse the topics below."
              : `${topicHits.length + faqHits.length} result${topicHits.length + faqHits.length === 1 ? "" : "s"}`}
          </p>
          <ul className="flex flex-col gap-2">
            {topicHits.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/help/${t.slug}`}
                  prefetch={false}
                  className="block rounded-xl border bg-card p-4 hover:bg-muted"
                >
                  <span className="font-medium">{t.title}</span>
                  <span className="block text-muted-foreground text-sm">{t.summary}</span>
                </Link>
              </li>
            ))}
            {faqHits.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/help/faq#${f.id}`}
                  prefetch={false}
                  className="block rounded-xl border bg-card p-4 hover:bg-muted"
                >
                  <span className="font-medium">{f.title}</span>
                  <span className="block text-muted-foreground text-sm">Question</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {q && topicHits.length + faqHits.length > 0 ? null : (
        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`g-${g.id}`}>
              <h2 id={`g-${g.id}`} className="mb-3 font-semibold text-lg">
                {g.title}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {topics
                  .filter((t) => t.group === g.id)
                  .map((t) => (
                    <li key={t.slug}>
                      <Link
                        href={`/help/${t.slug}`}
                        prefetch={false}
                        className="block h-full rounded-xl border bg-card p-4 hover:bg-muted"
                      >
                        <span className="font-medium">{t.title}</span>
                        <span className="block text-muted-foreground text-sm">{t.summary}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          <p className="text-sm">
            Short answers to common questions are in the{" "}
            <Link href="/help/faq" prefetch={false} className="underline underline-offset-4">
              FAQ
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

import Link from "next/link";

import { Search } from "lucide-react";

import { GuideBody } from "@/components/guide/guide-body";
import { Input } from "@/components/ui/input";
import { searchGuide } from "@/lib/guide-search";

type Faq = { id: string; question: string; answer: string; keywords: string[] };
type Topic = { slug: string; title: string; summary: string; keywords: string[]; body: string };

/** The FAQ with a search box on top (it runs in the browser, so it works offline). Guide topics that match are offered below. */
export function FaqList({ faq, topics }: { faq: Faq[]; topics: Topic[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const hits = q
    ? searchGuide(
        faq.map((f) => ({ ...f, title: f.question, summary: "", body: f.answer })),
        q,
      )
    : faq.map((f) => ({ ...f, title: f.question, summary: "", body: f.answer }));
  const topicHits = q
    ? searchGuide(
        topics.map((t) => ({ ...t, id: t.slug })),
        q,
      ).slice(0, 5)
    : [];
  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the questions: try “free”, “data” or “offline”"
          aria-label="Search the FAQ"
          className="h-11 pl-9 text-base"
        />
      </div>
      {q && (
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {hits.length === 0 ? "No question matches that." : `${hits.length} question${hits.length === 1 ? "" : "s"}`}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {hits.map((item) => (
          <section key={item.id} id={item.id} className="scroll-mt-6 rounded-xl border bg-card p-4">
            <h2 className="mb-2 font-semibold text-base">{item.question}</h2>
            <GuideBody markdown={item.answer} />
          </section>
        ))}
      </div>
      {topicHits.length > 0 && (
        <section aria-label="Also in the guide" className="flex flex-col gap-2">
          <h2 className="font-semibold text-base">Also in the guide</h2>
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
          </ul>
        </section>
      )}
    </div>
  );
}

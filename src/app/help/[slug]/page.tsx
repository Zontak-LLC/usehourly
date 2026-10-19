import Link from "next/link";
import { notFound } from "next/navigation";

import type { Metadata } from "next";

import { GuideBody } from "@/components/guide/guide-body";
import { GROUPS, TOPICS, topicBySlug } from "@/content/guide";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = topicBySlug((await params).slug);
  return topic ? { title: `${topic.title} · UseHourly guide`, description: topic.summary } : {};
}

export default async function TopicPage({ params }: Props) {
  const topic = topicBySlug((await params).slug);
  if (!topic) notFound();
  const group = GROUPS.find((g) => g.id === topic.group)?.title;
  const related = TOPICS.filter((t) => t.group === topic.group && t.slug !== topic.slug);
  return (
    <article>
      <p className="mb-3 text-sm">
        <Link href="/help" prefetch={false} className="text-muted-foreground underline underline-offset-4">
          Guide
        </Link>
        <span className="text-muted-foreground"> / {group}</span>
      </p>
      <h1 className="font-semibold text-3xl tracking-tight">{topic.title}</h1>
      <p className="mt-2 mb-6 text-muted-foreground">{topic.summary}</p>
      <GuideBody markdown={topic.body} />
      {related.length > 0 && (
        <section className="mt-10 border-t pt-6">
          <h2 className="mb-3 font-semibold text-base">More in this group</h2>
          <ul className="flex flex-col gap-1.5">
            {related.map((t) => (
              <li key={t.slug}>
                <Link href={`/help/${t.slug}`} prefetch={false} className="underline underline-offset-4">
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-10 text-muted-foreground text-sm">
        Something unclear or wrong?{" "}
        <a
          href="https://github.com/Zontak-LLC/usehourly/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          Tell us
        </a>
        .
      </p>
    </article>
  );
}

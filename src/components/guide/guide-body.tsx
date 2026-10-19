import type { ReactNode } from "react";

import Link from "next/link";

import { type Block, type Inline, parseMarkdown } from "@/lib/guide-markdown";

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        const key = `${i}-${p.t}`;
        if (p.t === "bold") return <strong key={key}>{p.text}</strong>;
        if (p.t === "code") {
          return (
            <code key={key} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">
              {p.text}
            </code>
          );
        }
        if (p.t === "link") {
          const external = p.href.startsWith("https://");
          return external ? (
            <a
              key={key}
              href={p.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              {p.text}
            </a>
          ) : (
            <Link key={key} href={p.href} prefetch={false} className="underline underline-offset-4">
              {p.text}
            </Link>
          );
        }
        return <span key={key}>{p.text}</span>;
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }): ReactNode {
  switch (block.t) {
    case "h":
      return <h2 className="mt-6 font-semibold text-lg">{block.text}</h2>;
    case "p":
      return (
        <p>
          <InlineText parts={block.inline} />
        </p>
      );
    case "note":
      return (
        <p className="rounded-xl border bg-card p-3 text-sm">
          <InlineText parts={block.inline} />
        </p>
      );
    case "ul":
    case "ol": {
      const List = block.t === "ul" ? "ul" : "ol";
      return (
        <List className={`${block.t === "ul" ? "list-disc" : "list-decimal"} space-y-1.5 pl-6`}>
          {block.items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a static list that never reorders
            <li key={i}>
              <InlineText parts={item} />
            </li>
          ))}
        </List>
      );
    }
  }
}

/** Renders a guide article's Markdown subset as plain, safe elements (no raw HTML ever). */
export function GuideBody({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-4 text-base leading-relaxed">
      {parseMarkdown(markdown).map((b, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: blocks are static
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}

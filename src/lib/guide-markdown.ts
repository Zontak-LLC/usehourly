/**
 * The few Markdown features the guide uses, parsed into plain data so a page renders it without ever touching raw HTML
 * (nothing in a guide article can inject markup). Blocks: `## heading`, paragraphs, `- ` lists, `1. ` lists, `> ` notes.
 * Inline: `**bold**`, `` `code` `` and `[text](/help/slug)` or `[text](https://...)`.
 */
export type Inline =
  | { t: "text"; text: string }
  | { t: "bold"; text: string }
  | { t: "code"; text: string }
  | { t: "link"; text: string; href: string };

export type Block =
  | { t: "h"; text: string }
  | { t: "p"; inline: Inline[] }
  | { t: "note"; inline: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] };

/** Only same-site paths and https addresses become links: `javascript:`, `data:` and the like stay plain text. */
export function safeHref(href: string): string | null {
  if (/^\/(?!\/)[\w\-./#?=&%]*$/.test(href)) return href;
  if (/^https:\/\/[^\s"'<>]+$/.test(href)) return href;
  return null;
}

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: "text", text: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ t: "bold", text: m[1] });
    else if (m[2] !== undefined) out.push({ t: "code", text: m[2] });
    else {
      const href = safeHref(m[4]);
      out.push(href ? { t: "link", text: m[3], href } : { t: "text", text: m[0] });
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", text: text.slice(last) });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let list: { t: "ul" | "ol"; items: Inline[][] } | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", inline: parseInline(para.join(" ")) });
    para = [];
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = /^- (.+)$/.exec(line);
    const numbered = /^\d+\. (.+)$/.exec(line);
    if (line.startsWith("## ")) {
      flush();
      blocks.push({ t: "h", text: line.slice(3) });
    } else if (line.startsWith("> ")) {
      flush();
      blocks.push({ t: "note", inline: parseInline(line.slice(2)) });
    } else if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      if (para.length || (list && list.t !== kind)) flush();
      list = list ?? { t: kind, items: [] };
      list.items.push(parseInline((bullet ?? numbered)?.[1] ?? ""));
    } else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** The plain words of a block of Markdown, for searching. */
export function plainText(source: string): string {
  return source
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*`>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

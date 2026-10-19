import { describe, expect, it } from "vitest";

import { FAQ, GROUPS, GUIDE_PATHS, GUIDE_VERSION, TOPICS, topicBySlug } from "@/content/guide";
import { parseMarkdown, plainText, safeHref } from "@/lib/guide-markdown";
import { searchGuide } from "@/lib/guide-search";
import { accessDecision } from "@/lib/route-access";
import { navLinks } from "@/navigation/sidebar/sidebar-items";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const asSearchable = [
  ...TOPICS.map((t) => ({ id: t.slug, title: t.title, summary: t.summary, keywords: t.keywords, body: t.body })),
  ...FAQ.map((f) => ({ id: `faq:${f.id}`, title: f.question, summary: "", keywords: f.keywords, body: f.answer })),
];
const ids = (query: string) => searchGuide(asSearchable, query).map((r) => r.id);
const everyText = [...TOPICS.map((t) => t.body), ...FAQ.map((f) => f.answer)];

describe("the guide's content", () => {
  it("has unique addresses, every field filled in, and every group used", () => {
    expect(new Set(TOPICS.map((t) => t.slug)).size).toBe(TOPICS.length);
    expect(new Set(FAQ.map((f) => f.id)).size).toBe(FAQ.length);
    for (const t of TOPICS) {
      expect(t.slug, t.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(t.title.length, t.slug).toBeGreaterThan(3);
      expect(t.summary.length, t.slug).toBeGreaterThan(10);
      expect(t.summary, t.slug).toMatch(/[.?)]$/); // a sentence, not a fragment
      expect(t.body.length, t.slug).toBeGreaterThan(150);
      expect(t.keywords.length, t.slug).toBeGreaterThan(0);
      expect(
        GROUPS.map((g) => g.id),
        t.slug,
      ).toContain(t.group);
    }
    for (const g of GROUPS)
      expect(
        TOPICS.some((t) => t.group === g.id),
        g.id,
      ).toBe(true);
  });

  it("only links to guide pages, FAQ answers and the privacy page that exist, and to https addresses", () => {
    const faqIds = new Set(FAQ.map((f) => f.id));
    for (const text of everyText) {
      for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
        const href = m[1];
        expect(safeHref(href), href).not.toBeNull();
        if (href.startsWith("https://")) continue;
        const [path, hash] = href.split("#");
        if (path === "/privacy" || path === "/terms") continue;
        if (path === "/help/faq") {
          expect(hash === undefined || faqIds.has(hash), href).toBe(true);
          continue;
        }
        expect(path.startsWith("/help/") && topicBySlug(path.slice(6)), href).toBeTruthy();
      }
    }
  });

  it("holds no raw HTML and no Markdown the renderer would leave showing as symbols", () => {
    for (const text of everyText) {
      // inside a `code span` angle brackets are just characters (like INV-<year>-001), so look at everything else
      expect(text.replace(/`[^`]*`/g, "")).not.toMatch(/<\/?[a-z][^>]*>/i);
      const shown = parseMarkdown(text).flatMap((b) =>
        b.t === "h" ? [b.text] : "items" in b ? b.items.flat().map((i) => i.text) : b.inline.map((i) => i.text),
      );
      for (const s of shown) {
        expect(s).not.toContain("**");
        expect(s).not.toContain("`");
        expect(s).not.toMatch(/\]\(/);
      }
    }
  });

  it("every ? link in the app points at a topic that exists", () => {
    const used: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) {
          for (const m of readFileSync(full, "utf8").matchAll(/<GuideLink topic="([a-z0-9-]+)"/g)) used.push(m[1]);
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(used.length).toBeGreaterThanOrEqual(3);
    for (const slug of used) expect(topicBySlug(slug), slug).toBeDefined();
    // the "which one do I use?" menu item links by address, not by component
    const menu = readFileSync(join(process.cwd(), "src/components/share-export-menu.tsx"), "utf8");
    expect(menu).toContain('href="/help/share-and-export"');
    expect(topicBySlug("share-and-export")).toBeDefined();
  });

  it("is reachable: public to everyone, in the menu, and fetched whole for offline use", () => {
    expect(accessDecision("/help", false)).toBe("allow");
    expect(accessDecision("/help/rounding", false)).toBe("allow");
    expect(accessDecision("/help/faq", true)).toBe("allow");
    expect(accessDecision("/helper", false)).toBe("to-login");
    expect(navLinks.find((l) => l.id === "guide")?.url).toBe("/help");
    expect(GUIDE_PATHS).toEqual(["/help", "/help/faq", ...TOPICS.map((t) => `/help/${t.slug}`)]);
    expect(GUIDE_VERSION).toMatch(/^[a-z0-9]+$/);
  });
});

describe("searching the guide", () => {
  it("finds topics by the words a person would type, best match first", () => {
    expect(ids("round up")[0]).toBe("rounding");
    expect(ids("rounding")).toContain("rounding");
    expect(ids("xero")[0]).toBe("xero-quickbooks");
    expect(ids("offline")[0]).toBe("offline");
    expect(ids("budget")[0]).toBe("budgets");
    expect(ids("holiday")).toContain("non-billable");
    expect(ids("token")).toContain("ai-assistants");
    expect(ids("iphone")).toContain("install-on-phone");
  });

  it("finds FAQ answers too, and every word typed has to match", () => {
    expect(ids("free")).toContain("faq:free");
    expect(ids("who can see my data")[0]).toBe("faq:privacy");
    expect(ids("rounding xero")).toEqual([]); // both words are needed
  });

  it("matches the start of a word, ignores capitals, and finds nothing for nothing", () => {
    expect(ids("ROUND")).toContain("rounding");
    expect(ids("   ")).toEqual([]);
    expect(ids("")).toEqual([]);
    expect(ids("zzzzqqq")).toEqual([]);
    expect(ids("ound")).toEqual([]); // not the middle of a word
  });
});

describe("the small Markdown renderer", () => {
  it("turns the supported shapes into data and never into markup", () => {
    const blocks = parseMarkdown(
      "## Heading\n\nA **bold** and `code` line with a [link](/help/faq).\n\n- one\n- two\n\n1. first\n2. second\n\n> a note",
    );
    expect(blocks.map((b) => b.t)).toEqual(["h", "p", "ul", "ol", "note"]);
    const p = blocks[1];
    expect(p.t === "p" && p.inline.map((i) => i.t)).toEqual(["text", "bold", "text", "code", "text", "link", "text"]);
    const list = blocks[2];
    expect(list.t === "ul" && list.items).toHaveLength(2);
  });

  it("will not make a link out of javascript:, data:, protocol-less or off-site http addresses, and leaves their text", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,x",
      "//evil.test",
      "http://insecure.test",
      "mailto:a@b.co",
    ]) {
      const [block] = parseMarkdown(`[click](${bad})`);
      expect(block.t === "p" && block.inline.some((i) => i.t === "link"), bad).toBe(false);
    }
    const [ok] = parseMarkdown("[x](/help/faq#free) [y](https://example.com/a)");
    expect(ok.t === "p" && ok.inline.filter((i) => i.t === "link").map((i) => (i.t === "link" ? i.href : ""))).toEqual([
      "/help/faq#free",
      "https://example.com/a",
    ]);
  });

  it("joins wrapped lines into one paragraph and strips markup for searching", () => {
    expect(parseMarkdown("one\ntwo\n\nthree")).toHaveLength(2);
    expect(plainText("A **bold** [link](/help/faq) and `code`")).toBe("A bold link and code");
  });
});

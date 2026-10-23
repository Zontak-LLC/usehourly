import { describe, expect, it } from "vitest";

import { ALL_ANSWERS, ANSWERS, helpAddressFor } from "@/content/help";
import { feature } from "@/lib/features";
import { parseMarkdown, plainText, safeHref } from "@/lib/guide-markdown";
import { searchGuide } from "@/lib/guide-search";
import { accessDecision } from "@/lib/route-access";
import { navLinks } from "@/navigation/sidebar/sidebar-items";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const asSearchable = ANSWERS.map((a) => ({ ...a, title: a.question, summary: "", body: a.answer }));
const ids = (query: string) => searchGuide(asSearchable, query).map((r) => r.id);
const visibleIds = new Set(ANSWERS.map((a) => a.id));

/** Every file under a folder, for the checks that read the app's own source. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("the Help page's answers", () => {
  it("have unique ids and old addresses, a real question, keywords and a short answer", () => {
    expect(new Set(ALL_ANSWERS.map((a) => a.id)).size).toBe(ALL_ANSWERS.length);
    const oldSlugs = ANSWERS.flatMap((a) => a.oldSlugs ?? []);
    expect(new Set(oldSlugs).size).toBe(oldSlugs.length);
    for (const old of oldSlugs) expect(visibleIds.has(old), old).toBe(false); // an old address never hides an answer
    for (const a of ALL_ANSWERS) {
      expect(a.id, a.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(a.question, a.id).toMatch(/\?$/);
      expect(a.keywords.length, a.id).toBeGreaterThan(0);
      expect(a.answer.length, a.id).toBeGreaterThan(80);
    }
    // the visible ones stay short: a few paragraphs, not an article
    for (const a of ANSWERS) expect(a.answer.length, a.id).toBeLessThan(1700);
  });

  it("show about six common questions before anything is typed, all of them visible", () => {
    const common = ANSWERS.filter((a) => a.common).map((a) => a.id);
    expect(common).toEqual(["free", "connect-assistant", "phone", "data", "privacy", "invoice"]);
    expect(ALL_ANSWERS.filter((a) => a.common && a.feature)).toEqual([]);
  });

  it("only link to answers that are shown, the privacy and terms pages, and https addresses", () => {
    for (const a of ANSWERS) {
      for (const m of a.answer.matchAll(/\]\(([^)]+)\)/g)) {
        const href = m[1];
        expect(safeHref(href), href).not.toBeNull();
        if (href.startsWith("https://") || href === "/privacy" || href === "/terms") continue;
        const target = href.match(/^\/help\?a=([a-z0-9-]+)$/)?.[1];
        expect(target && visibleIds.has(target), `${a.id}: ${href}`).toBeTruthy();
      }
    }
  });

  it("hold no raw HTML and no Markdown the renderer would leave showing as symbols", () => {
    for (const { answer } of ALL_ANSWERS) {
      // inside a `code span` angle brackets are just characters, so look at everything else
      expect(answer.replace(/`[^`]*`/g, "")).not.toMatch(/<\/?[a-z][^>]*>/i);
      const shown = parseMarkdown(answer).flatMap((b) =>
        b.t === "h" ? [b.text] : "items" in b ? b.items.flat().map((i) => i.text) : b.inline.map((i) => i.text),
      );
      for (const s of shown) {
        expect(s).not.toContain("**");
        expect(s).not.toContain("`");
        expect(s).not.toMatch(/\]\(/);
      }
    }
  });

  it("show and search only answers whose feature is on, but keep every answer written", () => {
    for (const a of ALL_ANSWERS) expect(ANSWERS.includes(a), a.id).toBe(!a.feature || feature(a.feature));
    expect(ALL_ANSWERS.length).toBeGreaterThan(ANSWERS.length); // this release hides some
    expect(ids("xero").includes("xero-quickbooks")).toBe(feature("accountingExport"));
    expect(ids("budget").includes("budgets")).toBe(feature("budgets"));
  });
});

describe("old guide addresses", () => {
  it("open the answer that replaced the topic, or search for its words, so no link breaks", () => {
    expect(helpAddressFor("making-an-invoice")).toBe("/help?a=invoice");
    expect(helpAddressFor("ai-assistants")).toBe("/help?a=connect-assistant");
    expect(helpAddressFor("share-and-export")).toBe("/help?a=excel");
    expect(helpAddressFor("offline")).toBe("/help?a=offline");
    expect(helpAddressFor("timer")).toBe("/help?a=timer");
    // a topic about a hidden feature becomes a search, which finds the visible answer about it
    if (!feature("rounding")) {
      expect(helpAddressFor("rounding")).toBe("/help?q=rounding");
      expect(ids("rounding")[0]).toBe("does-it-round");
    }
    expect(helpAddressFor("calendar-suggestions")).toBe(
      feature("calendar") ? "/help?a=calendar-suggestions" : "/help?q=calendar%20suggestions",
    );
    expect(helpAddressFor("---")).toBe("/help");
  });

  it("every old topic of the first release has somewhere to go", () => {
    for (const old of [
      "typing-time",
      "timer",
      "non-billable",
      "moving-and-merging",
      "making-an-invoice",
      "currency",
      "paid-and-year-summary",
      "emailing-invoices",
      "share-and-export",
      "offline",
      "install-on-phone",
      "menu-position",
      "ai-assistants",
      "archive",
      "demo-account",
      "delete-account",
    ]) {
      expect(helpAddressFor(old), old).toMatch(/^\/help\?a=/);
    }
  });
});

describe("links into Help from the app", () => {
  // A ? link may point at an answer about a hidden feature: it is drawn only with its feature, so the answer only has
  // to exist (ALL_ANSWERS), not be shown.
  it("every ? beside a setting points at an answer that exists", () => {
    const used = sourceFiles(join(process.cwd(), "src")).flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/<GuideLink topic="([a-z0-9-]+)"/g)].map((m) => m[1]),
    );
    expect(used.length).toBeGreaterThanOrEqual(3);
    for (const id of used)
      expect(
        ALL_ANSWERS.some((a) => a.id === id),
        id,
      ).toBe(true);
  });

  it("every /help?a= link in the app opens a shown answer, and nothing links to an old guide page", () => {
    for (const f of sourceFiles(join(process.cwd(), "src"))) {
      if (f.includes("__tests__") || f.includes("content/help")) continue;
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/["'`]\/help\?a=([a-z0-9-]+)/g))
        expect(visibleIds.has(m[1]), `${f}: ${m[1]}`).toBe(true);
      expect(text, f).not.toMatch(/["'`]\/help\/[a-z]/);
    }
  });

  it("Help is public to everyone and in the menu", () => {
    expect(accessDecision("/help", false)).toBe("allow");
    expect(accessDecision("/help/rounding", false)).toBe("allow"); // the old addresses still answer, with a redirect
    expect(accessDecision("/helper", false)).toBe("to-login");
    expect(navLinks.find((l) => l.id === "help")).toMatchObject({ title: "Help", url: "/help" });
  });
});

describe("searching Help", () => {
  it("finds answers by the words a person would type, best match first", () => {
    expect(ids("offline")[0]).toBe("offline");
    expect(ids("free")[0]).toBe("free");
    expect(ids("who can see my data")[0]).toBe("privacy");
    expect(ids("iphone")).toContain("phone");
    expect(ids("dark mode")[0]).toBe("dark-mode");
    expect(ids("api key")).toContain("connect-assistant");
    expect(ids("hourly rate")[0]).toBe("rate");
    expect(ids("billed twice")).toContain("billed-twice");
    expect(ids("delete account")).toContain("data");
    expect(ids("forgot password")[0]).toBe("password");
    expect(ids("excel")[0]).toBe("excel");
  });

  it("needs every word typed, matches the start of a word, ignores capitals, and finds nothing for nothing", () => {
    expect(ids("TIMER")).toContain("timer");
    expect(ids("timer zzzzqqq")).toEqual([]);
    expect(ids("   ")).toEqual([]);
    expect(ids("ound")).toEqual([]);
  });
});

describe("the small Markdown renderer", () => {
  it("turns the supported shapes into data and never into markup", () => {
    const blocks = parseMarkdown(
      "## Heading\n\nA **bold** and `code` line with a [link](/help?a=free).\n\n- one\n- two\n\n1. first\n2. second\n\n> a note",
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
    const [ok] = parseMarkdown("[x](/help?a=free) [y](https://example.com/a)");
    expect(ok.t === "p" && ok.inline.filter((i) => i.t === "link").map((i) => (i.t === "link" ? i.href : ""))).toEqual([
      "/help?a=free",
      "https://example.com/a",
    ]);
  });

  it("joins wrapped lines into one paragraph and strips markup for searching", () => {
    expect(parseMarkdown("one\ntwo\n\nthree")).toHaveLength(2);
    expect(plainText("A **bold** [link](/help?a=free) and `code`")).toBe("A bold link and code");
  });
});

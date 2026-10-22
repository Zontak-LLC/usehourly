/**
 * Search on the Account page. The page is one long page of sections; typing moves the sections that match to the
 * top (best first) and leaves the rest below in their usual order. Every typed word must match the START of a word
 * in a section's title or keywords, so "pass" finds the password section and "ex" finds Export.
 */
export type AccountSectionId = "account" | "invoices" | "data" | "ai";

export const ACCOUNT_SECTIONS: readonly { id: AccountSectionId; label: string; keywords: string }[] = [
  {
    id: "account",
    label: "Profile",
    keywords:
      "profile your account name email address password change sign in log in log out sign out picture photo avatar friday reminder session security demo",
  },
  {
    id: "data",
    label: "Your data",
    keywords:
      "export download everything zip csv excel import toggl clockify accounting xero quickbooks books device offline copy backup delete account remove erase privacy",
  },
  {
    id: "invoices",
    label: "Invoices",
    keywords:
      "invoice business name ein tax id address logo currency euro dollar pound payment how to pay bank details branding made with usehourly",
  },
  {
    id: "ai",
    label: "AI assistants",
    keywords: "ai assistant claude chatgpt cursor mcp connect token api key polish descriptions openai anthropic",
  },
];

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** 0 = no match. A title hit counts three times a keyword hit, so a section's own name wins. */
export function scoreSection(section: (typeof ACCOUNT_SECTIONS)[number], query: string): number {
  const typed = words(query);
  if (typed.length === 0) return 0;
  const title = words(section.label);
  const keys = words(section.keywords);
  let total = 0;
  for (const t of typed) {
    if (title.some((w) => w.startsWith(t))) total += 3;
    else if (keys.some((w) => w.startsWith(t))) total += 1;
    else return 0; // every typed word has to find something
  }
  return total;
}

/** The sections in the order to show them: matches first (best first), then the rest as before. */
export function rankSections(query: string): { id: AccountSectionId; label: string; matches: boolean }[] {
  const typing = words(query).length > 0;
  const scored = ACCOUNT_SECTIONS.map((s, i) => ({ id: s.id, label: s.label, i, score: scoreSection(s, query) }));
  scored.sort((a, b) => (typing ? b.score - a.score : 0) || a.i - b.i);
  return scored.map((s) => ({ id: s.id, label: s.label, matches: typing && s.score > 0 }));
}

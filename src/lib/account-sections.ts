/**
 * The Account page's sections (issue 283: a split view like Clients): their order, their names, which one an address
 * opens, and the one status line each shows in the list. Pure, so the page and the tests read the same rules.
 */
import { count } from "@/lib/plural";
import { sectionFromHash } from "@/lib/section-hash";

export const ACCOUNT_SECTIONS = [
  { id: "account", label: "Your account" },
  { id: "invoices", label: "Invoices" },
  { id: "data", label: "Your data" },
  { id: "ai", label: "API tokens & AI" },
] as const;

export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number]["id"];

/** One name per section: the list row and the section's heading say the same words. */
export const ACCOUNT_SECTION_LABELS = Object.fromEntries(ACCOUNT_SECTIONS.map((s) => [s.id, s.label])) as Record<
  AccountSectionId,
  string
>;

/** Old addresses that still open a section: the demo banner's `#claim` is the sign-up card under Your account. */
const ALIASES: Record<string, AccountSectionId> = { claim: "account" };

/** The section an address's #part opens, or null (no #part, or one we do not know: the list on a phone). */
export const accountSectionFromHash = (hash: string): AccountSectionId | null =>
  sectionFromHash(ACCOUNT_SECTIONS, hash, ALIASES);

export type AccountFacts = {
  is_demo: boolean;
  email_verified_at: Date | string | null;
  currency: string;
  business_name: string | null;
  logo: string | null;
};

/**
 * One line per section, from what the page already loads (the account, its clients, its tokens); a list that has not
 * arrived yet gives a plain description instead of a number, so the line never jumps from "0" to the real count.
 */
export function accountStatusLines(
  me: AccountFacts,
  clients: { projects: unknown[] }[] | undefined,
  tokens: { state: string }[] | undefined,
): Record<AccountSectionId, string> {
  const projects = clients?.reduce((n, c) => n + c.projects.length, 0) ?? 0;
  const live = tokens?.filter((t) => t.state === "active").length ?? 0;
  const business = me.business_name ? (me.logo ? "logo set" : "no logo yet") : "no business name yet";
  let account = me.email_verified_at ? "Email confirmed" : "Confirm your email";
  if (me.is_demo) account = "Sample account: not saved yet";
  let ai = tokens ? (live > 0 ? `${count(live, "token")} in use` : "No tokens yet") : "Connect an assistant";
  if (me.is_demo) ai = "Needs a free account";
  return {
    account,
    invoices: `${me.currency} · ${business}`,
    data: clients ? `${count(clients.length, "client")} · ${count(projects, "project")}` : "Export or delete",
    ai,
  };
}

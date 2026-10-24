/**
 * What the first release shows (feature audit, 2026-10-23). The core is a plain, solid timesheet and invoices; the
 * extras below are hidden, not deleted: their code, server procedures and tests stay, so turning one back on is
 * changing `false` to `true` here. A hidden feature has no button, card, menu item, setting, search result or guide
 * topic, and its page answers "not found".
 *
 * Kept on purpose and not listed: AI assistants (MCP, trimmed to connecting and tokens), Month and the Year summary
 * (read-only), the private invoice link, the demo, offline saving, light/dark mode.
 */
export const FEATURES = {
  /** Calendar import on Today (file, private address, Google). */
  calendar: false,
  /** Inviting people to log time for you (/dashboard/team). */
  team: false,
  /** "Polish" descriptions with your own AI key. */
  aiPolish: false,
  /** "Keep a copy on this device (experimental)". */
  localFirst: false,
  /** Xero / QuickBooks CSV export. */
  accountingExport: false,
  /** Importing time from a CSV (Toggl, Clockify or any). */
  importTime: false,
  /** Project budgets and the budget bar. */
  budgets: false,
  /** A client billed in its own currency (the account's one currency stays). */
  clientCurrency: false,
  /**
   * Tax on invoices (issue #71 step 4, 2026-10-23): a Tax card on Account > Invoices (name, rate, tax number) and an
   * "Add VAT (20%)" choice in the invoice builder. Built and tested; off until the owner chooses to show it.
   */
  invoiceTax: false,
  /**
   * Expenses and mileage on the Year summary (issue 100 first slice, 2026-10-23): record what you spent (or a trip at a
   * per-mile rate), see it by category and quarter, net of payments received, and in the Excel export. Built and tested;
   * off until the owner chooses to show it.
   */
  expenses: false,
  /** Per-client billing rounding. */
  rounding: false,
  /**
   * UseHourly emailing an invoice itself, and overdue reminders. Its button was REMOVED from the screens (2026-10-23,
   * issue 227: people send from their own mail app); the server code stays, so turning this on also needs a button again.
   */
  invoiceEmail: false,
  /** Sign-off timesheet links for a client. */
  signOff: false,
  /** "Email me this" on the Year summary. */
  reportEmail: false,
  /** The Friday "log your hours" email. */
  weeklyReminder: false,
  /** Swiping between pages and days on a phone. */
  swipe: false,
  /** Merging several entries of a day into one. */
  merge: false,
  /** Marking a whole day non-billable (a non-billable project covers the need). */
  nonBillableDays: false,
  /** "Add to several days" on Month. */
  multiDay: false,
  /** Font, centred layout, header style and menu position settings (light/dark stays). */
  appearanceExtras: false,
  /** Uploading a profile picture (initials are shown instead). */
  avatar: false,
} as const;

export type Feature = keyof typeof FEATURES;

/** Whether a feature is part of this release. */
export function feature(name: Feature): boolean {
  return FEATURES[name];
}

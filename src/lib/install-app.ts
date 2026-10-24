/**
 * The installed web app (issue 70, phase 1): the long-press shortcuts on the home-screen icon, which install offer a
 * browser gets, and the icon badge while a timer runs. Pure rules, so the manifest, the menu and the badge share them.
 */

/** A long-press on the home-screen icon (Android, desktop Chrome and Edge) jumps straight to these pages. */
export const APP_SHORTCUTS = [
  { name: "Log time", short_name: "Log time", description: "Add time to today", url: "/dashboard/today" },
  { name: "This week", short_name: "Week", description: "Your weekly timesheet", url: "/dashboard/week" },
  { name: "This month", short_name: "Month", description: "Your month at a glance", url: "/dashboard/month" },
  { name: "Invoices", short_name: "Invoices", description: "Your invoices", url: "/dashboard/invoices" },
] as const;

/**
 * What the account menu offers to install the app:
 * - "prompt": the browser gave us its install prompt (Chrome, Edge, Android), so one tap installs.
 * - "help": an iPhone or iPad in Safari, which has no prompt: the menu opens the Help answer (Share, Add to Home Screen).
 * - null: already installed (opened from the home screen) or a browser that offers nothing.
 */
export type InstallOffer = "prompt" | "help" | null;

export function installOffer({
  standalone,
  hasPrompt,
  userAgent,
  maxTouchPoints = 0,
}: {
  standalone: boolean;
  hasPrompt: boolean;
  userAgent: string;
  maxTouchPoints?: number;
}): InstallOffer {
  if (standalone) return null;
  if (hasPrompt) return "prompt";
  return isAppleMobile(userAgent, maxTouchPoints) ? "help" : null;
}

/** iPhone, iPod or iPad (an iPad says "Macintosh" but has more than one touch point). */
export function isAppleMobile(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** The Help answer the iPhone offer opens. */
export const INSTALL_HELP_URL = "/help?a=phone";

/** Whether the home-screen icon should carry a badge: only while a timer really runs. */
export function badgeOn(running: { started_at: Date | string | null } | null | undefined): boolean {
  return Boolean(running?.started_at);
}

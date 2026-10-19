/**
 * Rules for team members (delegated access, issue #68). A member signs in with their own account and logs time on the
 * clients an owner granted them; they never see rates, invoices or other clients.
 */

/** People one account may invite (pending and active together). */
export const MAX_TEAM_MEMBERS = 20;
/** Teams one account may belong to. */
export const MAX_TEAMS_JOINED = 10;
/** How long an invitation link works, in days. */
export const INVITE_DAYS = 7;
export const MAX_LABEL = 60;

export type InviteStatus = "pending" | "active" | "expired" | "removed";

/** Where an invitation stands. A removed person stays removed whatever else is stored. */
export function memberStatus(
  m: { member_id: string | null; revoked_at: number | null; expires_at: number | null },
  nowSeconds: number,
): InviteStatus {
  if (m.revoked_at !== null) return "removed";
  if (m.member_id !== null) return "active";
  return m.expires_at !== null && m.expires_at > nowSeconds ? "pending" : "expired";
}

/** What the owner calls someone: one line, no control characters, never longer than MAX_LABEL. */
export function cleanLabel(raw: string): string {
  const plain = [...raw].map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch)).join("");
  return plain.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
}

/** Invitation emails one account may send a day, and one address may receive a day (from every sender). */
export const TEAM_INVITES_PER_ACCOUNT_PER_DAY = 10;
export const TEAM_INVITES_PER_RECIPIENT_PER_DAY = 3;
const MIN_ACCOUNT_AGE_HOURS = 24;

/**
 * Why this account may not EMAIL invitations yet, or null if it may. The invitation itself is always made (the owner can
 * copy the link); this only decides whether UseHourly sends mail to a stranger on their behalf, the one step that can
 * damage the sending domain every other email depends on.
 */
export function inviteMailBlocker(
  owner: { email_verified_at: Date | null; email_bounced_at: Date | null; is_demo: boolean; created_at: Date },
  now: Date,
): string | null {
  if (owner.is_demo) return "Create a free account to email invitations.";
  if (owner.email_verified_at === null) {
    return "Confirm your own email address first (Account page), so replies can reach you. Copy the link and send it yourself for now.";
  }
  if (owner.email_bounced_at !== null) {
    return "Your own email address bounced, so replies could not reach you. Update it under Account first. Copy the link and send it yourself for now.";
  }
  if (now.getTime() - owner.created_at.getTime() < MIN_ACCOUNT_AGE_HOURS * 3_600_000) {
    return "New accounts can email invitations after their first day. Copy the link and send it yourself for now.";
  }
  return null;
}

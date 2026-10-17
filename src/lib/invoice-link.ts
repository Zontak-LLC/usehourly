/** Rules for the private link a freelancer sends a client to view an invoice (issue #35). Pure, so they are tested directly. */
export const LINK_EXPIRY_DAYS = [30, 90, 180] as const;
export const DEFAULT_LINK_EXPIRY_DAYS = 90;
/** Live links on one invoice, and live links across one account. */
export const MAX_LIVE_LINKS_PER_INVOICE = 5;
export const MAX_LIVE_LINKS = 200;
/** Expired links are deleted this long after they stop working. */
export const LINK_KEEP_AFTER_EXPIRY_DAYS = 90;

export type LinkStatus = "live" | "revoked" | "expired";

export function linkStatus(row: { revoked_at: number | null; expires_at: number }, nowSeconds: number): LinkStatus {
  if (row.revoked_at !== null) return "revoked";
  if (row.expires_at <= nowSeconds) return "expired";
  return "live";
}

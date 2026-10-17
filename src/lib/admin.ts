/**
 * Who may open the Insights page. The allow-list is the ADMIN_EMAILS secret (comma separated), kept out of
 * the repository because it is public. A match only counts for an account whose address was confirmed:
 * anyone can register an address they do not own, so an unconfirmed match must never grant access.
 */
export function adminEmails(raw: string | undefined = process.env.ADMIN_EMAILS): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(
  user: { email: string; email_verified_at: Date | null; is_demo?: boolean } | null | undefined,
  list: string[] = adminEmails(),
): boolean {
  if (!user || user.is_demo === true || user.email_verified_at === null) return false;
  return list.includes(user.email.trim().toLowerCase());
}

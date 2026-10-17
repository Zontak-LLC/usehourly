import { execFileSync } from "node:child_process";

/**
 * Deletes every account the browser tests made (addresses starting "e2e-") and everything that hangs off them, so the
 * local database is left as it was found, even if a run stopped half way.
 */
export default function globalTeardown() {
  const mine = "(SELECT id FROM auth_users WHERE email LIKE 'e2e-%@example.test')";
  const tables = [
    "invoice_emails",
    "invoice_links",
    "timesheet_shares",
    "invoice_logos",
    "invoices",
    "time_entries",
    "projects",
    "clients",
    "email_tokens",
    "api_tokens",
    "oauth_codes",
  ];
  const statements = [
    ...tables.map((t) => `DELETE FROM ${t} WHERE user_id IN ${mine};`),
    "DELETE FROM email_suppressions WHERE email LIKE 'e2e-%@example.test';",
    "DELETE FROM auth_users WHERE email LIKE 'e2e-%@example.test';",
  ].join(" ");
  try {
    execFileSync("npx", ["wrangler", "d1", "execute", "hourly-db", "--local", "--command", statements], {
      stdio: "pipe",
    });
  } catch (err) {
    console.error(
      "e2e cleanup failed (delete users with e-mail 'e2e-%@example.test' by hand):",
      (err as Error).message,
    );
  }
}

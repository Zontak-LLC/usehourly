/**
 * Rules for "Sign in with GitHub", kept free of I/O so they can be tested one by one.
 *
 * An account is matched first by the GitHub account id, then by a GitHub email address that GitHub
 * itself has verified. The email match is the risky part: someone could have registered a password
 * account with another person's address before that person ever came along. So a match with an
 * account whose address was never confirmed takes that account over for the GitHub owner: the old
 * password is made unusable and every old session is signed out.
 */

/** Stored as the password hash of an account that has no password. It is not a valid bcrypt hash, so no password matches it. */
export const NO_PASSWORD_HASH = "!github-account";

export type GithubEmail = { email: string; primary: boolean; verified: boolean };

/** The address to use: the primary one if GitHub verified it, else any verified one. Never an unverified one. */
export function pickVerifiedEmail(emails: readonly GithubEmail[]): string | null {
  const verified = emails.filter((e) => e.verified && e.email.includes("@"));
  const chosen = verified.find((e) => e.primary) ?? verified[0];
  return chosen ? chosen.email.trim().toLowerCase() : null;
}

type Known = { id: string; github_id: string | null; email_verified_at: Date | null; is_demo: boolean };

export type GithubDecision =
  | { action: "sign-in"; userId: string }
  | { action: "link"; userId: string }
  | { action: "take-over"; userId: string } // linked to an account whose address was never confirmed
  | { action: "create" }
  | { action: "refuse"; reason: "other-github" | "no-verified-email" };

export function decideGithubSignIn(input: {
  githubId: string;
  verifiedEmail: string | null;
  byGithubId: Known | null;
  byEmail: Known | null;
}): GithubDecision {
  if (input.byGithubId) return { action: "sign-in", userId: input.byGithubId.id };
  if (!input.verifiedEmail) return { action: "refuse", reason: "no-verified-email" };
  const known = input.byEmail;
  if (!known) return { action: "create" };
  if (known.github_id && known.github_id !== input.githubId) return { action: "refuse", reason: "other-github" };
  if (known.is_demo) return { action: "refuse", reason: "other-github" };
  return known.email_verified_at ? { action: "link", userId: known.id } : { action: "take-over", userId: known.id };
}

/** A display name: GitHub's name, else the GitHub username, else the part of the address before the @. */
export function displayNameFor(profile: { name?: string | null; login?: string | null }, email: string): string {
  const pick = profile.name?.trim() || profile.login?.trim() || email.split("@")[0];
  return pick.slice(0, 80);
}

export const GITHUB_REFUSAL: Record<"other-github" | "no-verified-email", string> = {
  "other-github": "That email address already belongs to an account linked to a different GitHub account.",
  "no-verified-email":
    "GitHub didn't share a verified email address. Verify one in your GitHub settings, or create an account with email and password.",
};

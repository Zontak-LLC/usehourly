/**
 * Rules for "Sign in with GitHub / Google", kept free of I/O so they can be tested one by one.
 *
 * An account is matched first by the provider's account id, then by an email address the provider
 * itself has verified. The email match is the risky part: someone could have registered a password
 * account with another person's address before that person ever came along. So a match with an
 * account whose address was never confirmed takes that account over for the provider's owner: the
 * old password is made unusable and every old session is signed out.
 */

export type SocialProvider = "github" | "google";
export const PROVIDERS: readonly SocialProvider[] = ["github", "google"];
/** The `auth_users` column that holds each provider's account id. */
export const PROVIDER_COLUMN = { github: "github_id", google: "google_id" } as const;

/**
 * Stored as the password hash of an account that has no password. It is not a valid bcrypt hash, so no
 * password matches it. (The text says "github" because that is what the first such accounts were; the
 * value must not change, it is already in the database.)
 */
export const NO_PASSWORD_HASH = "!github-account";

export type VerifiedEmail = { email: string; primary: boolean; verified: boolean };

/** The address to use: the primary one if the provider verified it, else any verified one. Never an unverified one. */
export function pickVerifiedEmail(emails: readonly VerifiedEmail[]): string | null {
  const verified = emails.filter((e) => e.verified && e.email.includes("@"));
  const chosen = verified.find((e) => e.primary) ?? verified[0];
  return chosen ? chosen.email.trim().toLowerCase() : null;
}

export type Known = {
  id: string;
  email_verified_at: Date | null;
  is_demo: boolean;
  /** The id already linked for this same provider, if any. */
  linkedId: string | null;
};

export type SocialDecision =
  | { action: "sign-in"; userId: string }
  | { action: "link"; userId: string }
  | { action: "take-over"; userId: string } // linked to an account whose address was never confirmed
  | { action: "create" }
  | { action: "refuse"; reason: "other-account" | "no-verified-email" };

export function decideSocialSignIn(input: {
  providerId: string;
  verifiedEmail: string | null;
  byProviderId: Known | null;
  byEmail: Known | null;
}): SocialDecision {
  if (input.byProviderId) return { action: "sign-in", userId: input.byProviderId.id };
  if (!input.verifiedEmail) return { action: "refuse", reason: "no-verified-email" };
  const known = input.byEmail;
  if (!known) return { action: "create" };
  if (known.linkedId && known.linkedId !== input.providerId) return { action: "refuse", reason: "other-account" };
  if (known.is_demo) return { action: "refuse", reason: "other-account" };
  return known.email_verified_at ? { action: "link", userId: known.id } : { action: "take-over", userId: known.id };
}

/** A display name: the provider's name, else the username, else the part of the address before the @. */
export function displayNameFor(profile: { name?: string | null; login?: string | null }, email: string): string {
  const pick = profile.name?.trim() || profile.login?.trim() || email.split("@")[0];
  return pick.slice(0, 80);
}

export const SOCIAL_REFUSAL: Record<"other-account" | "no-verified-email", string> = {
  "other-account": "That email address already belongs to an account linked to a different GitHub or Google account.",
  "no-verified-email":
    "The sign-in didn't share a verified email address. Verify one with the provider, or create an account with email and password.",
};

/**
 * Which copy of the site this is. "staging" is set only at build time by `npm run staging:deploy`
 * (NEXT_PUBLIC_APP_ENV); production and local builds leave it unset. Staging shows a banner, is never indexed
 * (see next.config.mjs) and has its own database, secrets and address.
 */
export const isStaging = () => process.env.NEXT_PUBLIC_APP_ENV === "staging";

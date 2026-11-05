/**
 * How long a wait runs before the spinner shows (issue 430): a faster answer shows nothing, so nothing flickers. A plain
 * module (never a "use client" file), so unit tests and browser tests can import it.
 */
export const SPINNER_DELAY_MS = 300;

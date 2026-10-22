/**
 * Rounds to three decimals. Positions drawn with sin and cos are rounded so the server and the browser print the same
 * digits: they can differ in the last places, and React then reports a hydration mismatch.
 */
export const round3 = (n: number): number => Math.round(n * 1000) / 1000;

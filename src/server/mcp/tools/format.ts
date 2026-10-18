export const round2 = (n: number) => Math.round(n * 100) / 100;
export const hours = (minutes: number) => round2(minutes / 60);
export const toCents = (d: number) => Math.round(d * 100);

export const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

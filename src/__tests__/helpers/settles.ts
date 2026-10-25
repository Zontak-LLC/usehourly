/** "settled" when `p` settles within `ms`, otherwise "hung": tells a slow answer from one that never comes. */
export const settles = <T>(p: Promise<T>, ms = 1000) =>
  Promise.race([p.then(() => "settled"), new Promise((r) => setTimeout(() => r("hung"), ms))]);

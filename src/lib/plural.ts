/** "1 client", "3 clients": a count with its word in the right number. The plural is the word plus "s" unless given. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Just the word, singular for 1 and plural otherwise, for labels that show the number separately. */
export function word(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** Up to two capital letters for a name ("Ada Lovelace" is AL, "ada" is A), or "?" when there is nothing to use. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  const out = letters.map((w) => [...w][0]?.toUpperCase() ?? "").join("");
  return out || "?";
}

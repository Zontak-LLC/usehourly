/**
 * The section a split view's address opens (Account, the Year summary): the #part names one of `sections`, or an old
 * name in `aliases`; anything else (no #part, an unknown word, "toString") is null, which a phone shows as the list.
 */
export function sectionFromHash<Id extends string>(
  sections: readonly { id: Id }[],
  hash: string,
  aliases: Readonly<Record<string, Id>> = {},
): Id | null {
  const id = hash.replace(/^#/, "");
  return sections.find((s) => s.id === id)?.id ?? (Object.hasOwn(aliases, id) ? aliases[id] : null);
}

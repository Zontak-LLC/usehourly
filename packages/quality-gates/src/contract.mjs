// A rule over EVERY tRPC procedure, so a new one cannot slip past it:
//  1. Called signed out, it is refused (UNAUTHORIZED), unless it is on the project's public list.
//  2. A mutation declares an input schema, unless it is on the project's no-input list.
// Adding to either list is a visible, reviewed decision in the project's test.

/**
 * @param {{
 *   router: { _def: { procedures: object } },
 *   caller: object,
 *   publicProcedures?: Iterable<string>,
 *   noInputMutations?: Iterable<string>,
 *   refusedCode?: string,
 * }} opts `caller` is the router's caller for a signed-out context (createCallerFactory(router)({ session: null, ... }))
 */
export async function checkProcedureContract({
  router,
  caller,
  publicProcedures = [],
  noInputMutations = [],
  refusedCode = "UNAUTHORIZED",
}) {
  const open = new Set(publicProcedures);
  const noInput = new Set(noInputMutations);
  const procedures = /** @type {Record<string, { _def: { type: string, inputs: unknown[] } }>} */ (
    router._def.procedures
  );
  const names = Object.keys(procedures);
  const openToSignedOut = [];
  for (const name of names) {
    if (open.has(name)) continue;
    let code;
    try {
      const fn = name.split(".").reduce((node, part) => node[part], /** @type {any} */ (caller));
      await fn(undefined);
    } catch (e) {
      code = /** @type {{ code?: string }} */ (e).code;
    }
    if (code !== refusedCode) openToSignedOut.push(`${name} -> ${code}`);
  }
  const mutationsWithoutInput = names.filter(
    (n) => procedures[n]?._def.type === "mutation" && !procedures[n]?._def.inputs.length && !noInput.has(n),
  );
  return {
    names,
    openToSignedOut,
    mutationsWithoutInput,
    /** Names on the public list that the router does not have (a typo, or a removed procedure). */
    unknownPublic: [...open].filter((n) => !names.includes(n)),
  };
}

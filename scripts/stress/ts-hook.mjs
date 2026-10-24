// Lets plain `node` load the app's own TypeScript modules (src/lib) from a script. Node strips the types itself; this
// hook only adds the ".ts" the app's imports leave out ("./money" means "./money.ts"). Used by the stress seed so its
// invoices are built by the same code as the app's (buildInvoice, buildSearchText, summarizeInvoice).
//
//   node --import ./scripts/stress/ts-hook.mjs scripts/stress/seed.mjs

import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

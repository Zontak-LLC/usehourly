// quality-gates: the checks a linter cannot express, as functions a project's own tests and scripts call.

export { loadConfig, main } from "./cli.mjs";
export { colourIncreases, countColours, runColours } from "./colours.mjs";
export { checkProcedureContract } from "./contract.mjs";
export { globToRegExp, listFiles, matchesAny } from "./files.mjs";
export { applyInit, planInit } from "./init.mjs";
export { checkLayers, importsOf } from "./layers.mjs";
export { BUILTIN_RULES, checkRules, resolveRules, runRules } from "./rules.mjs";
export { coverageFloor } from "./vitest.mjs";

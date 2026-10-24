import { defineConfig } from "vitest/config";

import { coverageFloor } from "./packages/quality-gates/src/vitest.mjs";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    coverage: coverageFloor({
      // The logic lives in lib/ and server/; screens are exercised by the Playwright suite (e2e/).
      include: ["src/lib/**", "src/server/**", "packages/*/src/**"],
      exclude: ["src/**/*.test.ts", "src/__tests__/**", "src/lib/**/*.client.ts"],
      // A floor, not a target: set a few points under what was measured on 2026-10-18 (88 / 83 / 91 / 89),
      // so a change that adds code without tests fails CI. Raise it when coverage rises.
      thresholds: { statements: 87, branches: 82, functions: 90, lines: 88 },
    }),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "trpc-mcp-server": path.resolve(__dirname, "packages/trpc-mcp/src/index.ts"),
      "quality-gates": path.resolve(__dirname, "packages/quality-gates/src/index.mjs"),
    },
  },
});

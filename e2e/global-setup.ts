import { rmSync } from "node:fs";

/** Start every run with an empty screenshot folder, so the report never mixes in pictures from an older run. */
export default function globalSetup() {
  rmSync("e2e/report/screens", { recursive: true, force: true });
}

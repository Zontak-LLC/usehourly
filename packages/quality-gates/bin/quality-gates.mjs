#!/usr/bin/env node
import { main } from "../src/cli.mjs";

process.exitCode = await main(process.argv.slice(2), {
  out: (s) => process.stdout.write(`${s}\n`),
  err: (s) => process.stderr.write(`${s}\n`),
});

// A throwaway project on disk: a temp folder with the given files, committed to its own git repository (the checks
// read the file list from git, as they do in a real project).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type Fixture = { dir: string; read: (file: string) => string; write: (file: string, text: string) => void };

const made: string[] = [];

// Run git in the fixture only: a hook (pre-push runs the tests) exports GIT_DIR and friends, which would point git here
// and in listFiles at the outer repository.
for (const k of Object.keys(process.env)) if (k.startsWith("GIT_")) delete process.env[k];
const git = (dir: string, ...args: string[]) => execFileSync("git", args, { cwd: dir });

export function fixture(files: Record<string, string>, { git: useGit = true } = {}): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "quality-gates-"));
  made.push(dir);
  const write = (file: string, text: string) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  for (const [file, text] of Object.entries(files)) write(file, text);
  if (useGit) {
    git(dir, "init", "-q");
    git(dir, "add", "-A");
  }
  return {
    dir,
    // A file written later is added to git too, as a new file in a real project would be before it is checked.
    write: (file, text) => {
      write(file, text);
      if (useGit) git(dir, "add", file);
    },
    read: (file) => readFileSync(join(dir, file), "utf8"),
  };
}

/** Remove every fixture made so far (call from afterAll). */
export function cleanFixtures() {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** Run the command line in a fixture and keep what it printed. */
export async function run(main: typeof import("quality-gates").main, dir: string, ...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { cwd: dir, out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

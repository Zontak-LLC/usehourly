// Which files a check looks at: the files git knows about, narrowed by folder, extension and path globs.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SPECIAL = /[.+^${}()|[\]\\]/g;

/**
 * A path glob as a RegExp over the whole path: `**` is any number of folders, `*` stays inside one folder, `?` is one
 * character. `src/**` matches everything under src, `**\/__tests__/**` a __tests__ folder at any depth.
 * @param {string} glob
 */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(SPECIAL, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/**
 * True when the path matches one of the globs (a RegExp is tested as it is).
 * @param {string} file
 * @param {string[] | RegExp | undefined} globs
 */
export function matchesAny(file, globs) {
  if (!globs) return false;
  if (globs instanceof RegExp) return globs.test(file);
  return globs.some((g) => globToRegExp(g).test(file));
}

/**
 * The files git lists under `include` (folders or files), with one of the extensions, still on disk (a deletion not yet
 * staged is skipped, not a crash), and not matching `exclude`. Paths are relative to `cwd`, in git's order.
 * @param {{ cwd?: string, include: string[], extensions: string[], exclude?: string[] }} opts
 */
export function listFiles({ cwd = process.cwd(), include, extensions, exclude = [] }) {
  const ext = new RegExp(`\\.(${extensions.join("|")})$`);
  return execFileSync("git", ["ls-files", ...include], { cwd, encoding: "utf8" })
    .split("\n")
    .filter((f) => ext.test(f) && existsSync(join(cwd, f)) && !matchesAny(f, exclude));
}

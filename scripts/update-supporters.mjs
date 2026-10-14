// Refreshes the supporters thank-you: reads the PUBLIC sponsors of the organization from
// GitHub Sponsors (people who sponsor privately are never read) and rewrites
//   - src/data/supporters.json   (shown on the landing page)
//   - the list between <!-- supporters:start --> and <!-- supporters:end --> in README.md
//
//   npm run supporters           then review the diff, commit and deploy
//
// Needs the GitHub CLI signed in (`gh auth status`) with read:org.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OWNER = "Zontak-LLC";
const SPONSOR_URL = `https://github.com/sponsors/${OWNER}`;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const query = `{ organization(login:"${OWNER}"){ sponsorshipsAsMaintainer(first:100, includePrivate:false, activeOnly:false){
  nodes{ sponsorEntity{ __typename ... on User{ login name url } ... on Organization{ login name url } } } } } }`;

let out;
try {
  out = execFileSync("gh", ["api", "graphql", "-f", `query=${query}`], { encoding: "utf8" });
} catch (err) {
  console.error("Could not read the sponsors from GitHub. Is `gh auth status` signed in with read:org?");
  console.error(String(err.stderr || err.message).slice(0, 400));
  process.exit(1);
}

const nodes = JSON.parse(out)?.data?.organization?.sponsorshipsAsMaintainer?.nodes ?? [];
const seen = new Set();
const supporters = [];
for (const n of nodes) {
  const e = n.sponsorEntity;
  if (!e) continue;
  const name = (e.name || e.login || "").trim();
  if (!name || seen.has(name.toLowerCase())) continue;
  seen.add(name.toLowerCase());
  supporters.push({ name, url: e.url });
}
supporters.sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(join(root, "src/data/supporters.json"), `${JSON.stringify(supporters, null, 2)}\n`);

const esc = (s) => s.replace(/([\\`*_{}[\]()#+\-.!|<>])/g, "\\$1");
const block = supporters.length
  ? supporters.map((s) => `- [${esc(s.name)}](${s.url})`).join("\n")
  : `_Be the first: [sponsor UseHourly on GitHub](${SPONSOR_URL})._`;

const readmePath = join(root, "README.md");
const readme = readFileSync(readmePath, "utf8");
const re = /<!-- supporters:start -->[\s\S]*?<!-- supporters:end -->/;
if (!re.test(readme)) {
  console.error("README.md has no <!-- supporters:start --> ... <!-- supporters:end --> block.");
  process.exit(1);
}
writeFileSync(readmePath, readme.replace(re, `<!-- supporters:start -->\n${block}\n<!-- supporters:end -->`));

console.log(
  `${supporters.length} public supporter${supporters.length === 1 ? "" : "s"}: ${supporters.map((s) => s.name).join(", ") || "(none yet)"}`,
);

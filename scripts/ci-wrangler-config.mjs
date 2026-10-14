// Writes wrangler.jsonc from environment variables, for CI. wrangler.jsonc is git-ignored (it
// holds account and database ids), so a clean checkout does not have one.
//
// Required:  CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, APP_URL (for example https://usehourly.app)
// Optional:  WORKER_NAME (default "hourly"), D1_DATABASE_NAME (default "hourly-db"),
//            CUSTOM_DOMAIN (a host name to attach as a Cloudflare custom domain)
import { writeFileSync } from "node:fs";

const need = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Set it in the CI project's environment variables.`);
    process.exit(1);
  }
  return v;
};

const appUrl = need("APP_URL").replace(/\/+$/, "");
const config = {
  $schema: "node_modules/wrangler/config-schema.json",
  name: process.env.WORKER_NAME || "hourly",
  account_id: need("CLOUDFLARE_ACCOUNT_ID"),
  main: ".open-next/worker.js",
  compatibility_date: "2025-04-01",
  compatibility_flags: ["nodejs_compat"],
  placement: { mode: "smart" },
  assets: { directory: ".open-next/assets", binding: "ASSETS" },
  d1_databases: [
    {
      binding: "DB",
      database_name: process.env.D1_DATABASE_NAME || "hourly-db",
      database_id: need("D1_DATABASE_ID"),
    },
  ],
  vars: { AUTH_URL: appUrl, NEXT_PUBLIC_APP_URL: appUrl },
  workers_dev: true,
};
if (process.env.CUSTOM_DOMAIN) config.routes = [{ pattern: process.env.CUSTOM_DOMAIN, custom_domain: true }];

writeFileSync("wrangler.jsonc", `${JSON.stringify(config, null, 2)}\n`);
console.log(`wrangler.jsonc written for ${config.name} (${appUrl})`);

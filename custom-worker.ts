/**
 * The Worker's entry point: the OpenNext app exactly as before, plus an hourly cron trigger that sends
 * the Friday "log your hours" emails. The cron handler does not talk to the database itself; it calls the
 * app's own internal route (/api/cron/weekly-reminders), signed with a key derived from AUTH_SECRET, so
 * all the work runs in the same code and bundle as the rest of the app.
 */
// biome-ignore lint/suspicious/noTsIgnore: the file exists only after `opennextjs-cloudflare build`, so an expected error would flip
// @ts-ignore
import openNext from "./.open-next/worker.js";
import { cronToken } from "./src/lib/reminder-token";

// biome-ignore lint/suspicious/noTsIgnore: same reason as above
// @ts-ignore
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

type Env = { AUTH_SECRET?: string; NEXT_PUBLIC_APP_URL?: string; AUTH_URL?: string };
type Ctx = { waitUntil(promise: Promise<unknown>): void };

async function runReminders(env: Env, ctx: Ctx) {
  const origin = (env.NEXT_PUBLIC_APP_URL || env.AUTH_URL || "").replace(/\/+$/, "");
  if (!origin || !env.AUTH_SECRET) {
    console.error("weekly reminders: AUTH_URL or AUTH_SECRET is not set");
    return;
  }
  const request = new Request(`${origin}/api/cron/weekly-reminders`, {
    method: "POST",
    headers: { authorization: `Bearer ${await cronToken(env.AUTH_SECRET)}` },
  });
  const response = await openNext.fetch(request, env, ctx);
  if (!response.ok) console.error(`weekly reminders: the app answered ${response.status}`);
  else console.log("weekly reminders:", await response.text());
}

export default {
  fetch: (request: Request, env: Env, ctx: Ctx) => openNext.fetch(request, env, ctx),
  async scheduled(_controller: unknown, env: Env, ctx: Ctx) {
    ctx.waitUntil(runReminders(env, ctx));
  },
};

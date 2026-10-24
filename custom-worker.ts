/**
 * The Worker's entry point: the OpenNext app exactly as before, plus two cron triggers. The hourly one
 * (REMINDER_CRON in src/lib/cron-jobs.ts) sends the Friday "log your hours" emails. The 5-minute one (WARM_CRON) asks the app's own
 * health route, which runs `SELECT 1`, so the D1 database and a loaded copy of the app stay awake: a cold start
 * made the first page switch after a quiet spell take a second or more. The cron handler does not talk to the database itself; it calls the
 * app's own internal route (/api/cron/weekly-reminders), signed with a key derived from AUTH_SECRET, so
 * all the work runs in the same code and bundle as the rest of the app.
 */
// biome-ignore lint/suspicious/noTsIgnore: the file exists only after `opennextjs-cloudflare build`, so an expected error would flip
// @ts-ignore
import openNext from "./.open-next/worker.js";
import { cronJobs } from "./src/lib/cron-jobs";
import { cronToken } from "./src/lib/reminder-token";

// biome-ignore lint/suspicious/noTsIgnore: same reason as above
// @ts-ignore
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

type Env = { AUTH_SECRET?: string; NEXT_PUBLIC_APP_URL?: string; AUTH_URL?: string };
type Ctx = { waitUntil(promise: Promise<unknown>): void };

const appOrigin = (env: Env) => (env.NEXT_PUBLIC_APP_URL || env.AUTH_URL || "").replace(/\/+$/, "");

async function warmUp(env: Env, ctx: Ctx) {
  const origin = appOrigin(env);
  if (!origin) return;
  const response = await openNext.fetch(new Request(`${origin}/api/health`, { method: "HEAD" }), env, ctx);
  if (!response.ok) console.error(`warm up: the app answered ${response.status}`);
}

async function runReminders(env: Env, ctx: Ctx) {
  const origin = appOrigin(env);
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
  async scheduled(controller: { cron?: string }, env: Env, ctx: Ctx) {
    const jobs = cronJobs(controller.cron);
    if (jobs.includes("warm")) ctx.waitUntil(warmUp(env, ctx));
    if (jobs.includes("reminders")) ctx.waitUntil(runReminders(env, ctx));
  },
};

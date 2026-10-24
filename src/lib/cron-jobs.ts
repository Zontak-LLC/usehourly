/** The hourly cron: the Friday reminders (and the sweeps that run with them). */
export const REMINDER_CRON = "0 * * * *";
/** Every 5 minutes: a warm-up ping, so the database and a loaded copy of the app stay awake. */
export const WARM_CRON = "*/5 * * * *";

/** Which jobs one cron firing runs (custom-worker.ts). Every firing warms; only the hourly one sends reminders. */
export function cronJobs(cron: string | undefined): ("warm" | "reminders")[] {
  return cron === REMINDER_CRON ? ["warm", "reminders"] : ["warm"];
}

import type { PrismaClient } from "@prisma/client";

import { logError } from "@/lib/log";
import type { Mailer } from "@/lib/mailer";
import { buildWeeklyReminder, isDue, mondayOf } from "@/lib/reminder";
import { unsubscribeToken } from "@/lib/reminder-token";

export type ReminderRun = { considered: number; due: number; sent: number; failed: number };

const PAGE = 200;
const MAX_PER_RUN = 5_000;
// Each due person costs up to 4 outside calls (claim, the week's entries, the email, maybe the undo), and one
// Worker request allows about 1,000. Later hourly runs catch up until Friday midnight local (about 8 runs), so
// this covers about 1,200 due people per time zone per week.
const MAX_DUE_PER_RUN = 150;

type DueStatus = ReturnType<typeof isDue>;
type Person = { id: string; name: string | null; email: string; reminder_sent_week: string | null };

/**
 * Sends this week's reminder to everyone who is due right now. Called every hour by the cron job.
 *
 * Only people who turned it on, confirmed their email, and have a time zone are considered; demo
 * accounts never are. Each person is claimed first with one conditional UPDATE (the week they were
 * last sent), so two overlapping runs cannot both send. If sending fails the claim is undone, and the
 * next hourly run tries again for as long as it is still Friday evening for them. One run handles at
 * most `MAX_DUE_PER_RUN` due people; the next hourly run picks up the rest.
 */
export async function runWeeklyReminders(opts: {
  prisma: PrismaClient;
  mailer: Mailer;
  now?: Date;
  appUrl: string;
  secret: string;
}): Promise<ReminderRun> {
  const now = opts.now ?? new Date();
  const run: ReminderRun = { considered: 0, due: 0, sent: 0, failed: 0 };
  let after = "";

  while (run.considered < MAX_PER_RUN) {
    const people = await findReminderPage({ prisma: opts.prisma, after });
    if (people.length === 0) break;
    after = people[people.length - 1].id;

    for (const person of people) {
      if (run.due >= MAX_DUE_PER_RUN) return run;
      run.considered++;
      const status = dueStatus(now, person.timezone as string, person.reminder_sent_week);
      if (!status?.due) continue;
      run.due++;
      const outcome = await sendOneReminder({ ...opts, person, status });
      if (outcome !== "skipped") run[outcome]++;
    }
    if (people.length < PAGE) break;
  }
  return run;
}

/** Loads the next page of people who may get the reminder, in `id` order after `after`. */
function findReminderPage(opts: { prisma: PrismaClient; after: string }) {
  return opts.prisma.authUser.findMany({
    where: {
      id: { gt: opts.after },
      weekly_reminder: true,
      is_demo: false,
      email_verified_at: { not: null },
      email_bounced_at: null,
      timezone: { not: null },
    },
    select: { id: true, name: true, email: true, timezone: true, reminder_sent_week: true },
    orderBy: { id: "asc" },
    take: PAGE,
  });
}

function dueStatus(now: Date, timezone: string, sentWeek: string | null): DueStatus | undefined {
  try {
    return isDue(now, timezone, sentWeek);
  } catch {
    return undefined; // a time zone this server cannot read: skip, never crash the run
  }
}

type ReminderSend = {
  prisma: PrismaClient;
  mailer: Mailer;
  person: Person;
  status: DueStatus;
  appUrl: string;
  secret: string;
};

/** Claims, emails and (if the email fails) unclaims one due person. "skipped" means another run claimed them. */
async function sendOneReminder(opts: ReminderSend): Promise<"sent" | "failed" | "skipped"> {
  const { prisma, person, status } = opts;
  const previousWeek = person.reminder_sent_week; // remembered now, in case the claim has to be undone
  // Claim this week. Only one run can win; the others see count 0 and move on.
  const claim = await prisma.authUser.updateMany({
    where: {
      id: person.id,
      weekly_reminder: true,
      OR: [{ reminder_sent_week: null }, { reminder_sent_week: { not: status.week } }],
    },
    data: { reminder_sent_week: status.week },
  });
  if (claim.count === 0) return "skipped";

  try {
    await emailReminder(opts);
    return "sent";
  } catch (err) {
    logError("weekly_reminder_failed", err);
    // Undo the claim so the next hourly run can try again.
    await prisma.authUser.updateMany({
      where: { id: person.id, reminder_sent_week: status.week },
      data: { reminder_sent_week: previousWeek },
    });
    return "failed";
  }
}

/** Loads the person's entries for this week and sends the reminder email. Throws when the mailer fails. */
async function emailReminder(opts: ReminderSend): Promise<void> {
  const { prisma, mailer, person, status, appUrl, secret } = opts;
  const entries = await prisma.timeEntry.findMany({
    where: { user_id: person.id, date: { gte: mondayOf(status.today), lte: status.today } },
    select: {
      date: true,
      minutes: true,
      project: { select: { name: true, client: { select: { name: true } } } },
    },
  });
  const token = await unsubscribeToken(secret, person.id);
  const offQuery = `?u=${encodeURIComponent(person.id)}&t=${encodeURIComponent(token)}`;
  await mailer.send(
    buildWeeklyReminder({
      name: person.name,
      email: person.email,
      today: status.today,
      entries,
      appUrl,
      unsubscribeUrl: `${appUrl}/reminders/off${offQuery}`,
      oneClickUrl: `${appUrl}/api/reminders/off${offQuery}`,
    }),
  );
}

import type { PrismaClient } from "@prisma/client";

import { logError } from "@/lib/log";
import type { Mailer } from "@/lib/mailer";
import { buildWeeklyReminder, isDue, mondayOf } from "@/lib/reminder";
import { unsubscribeToken } from "@/lib/reminder-token";

export type ReminderRun = { considered: number; due: number; sent: number; failed: number };

const PAGE = 200;
const MAX_PER_RUN = 5_000;

/**
 * Sends this week's reminder to everyone who is due right now. Called every hour by the cron job.
 *
 * Only people who turned it on, confirmed their email, and have a time zone are considered; demo
 * accounts never are. Each person is claimed first with one conditional UPDATE (the week they were
 * last sent), so two overlapping runs cannot both send. If sending fails the claim is undone, and the
 * next hourly run tries again for as long as it is still Friday evening for them.
 */
export async function runWeeklyReminders(opts: {
  prisma: PrismaClient;
  mailer: Mailer;
  now?: Date;
  appUrl: string;
  secret: string;
}): Promise<ReminderRun> {
  const { prisma, mailer, appUrl, secret } = opts;
  const now = opts.now ?? new Date();
  const run: ReminderRun = { considered: 0, due: 0, sent: 0, failed: 0 };
  let after = "";

  while (run.considered < MAX_PER_RUN) {
    const people = await prisma.authUser.findMany({
      where: {
        id: { gt: after },
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
    if (people.length === 0) break;
    after = people[people.length - 1].id;

    for (const person of people) {
      run.considered++;
      let status: ReturnType<typeof isDue>;
      try {
        status = isDue(now, person.timezone as string, person.reminder_sent_week);
      } catch {
        continue; // a time zone this server cannot read: skip, never crash the run
      }
      if (!status.due) continue;
      run.due++;

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
      if (claim.count === 0) continue;

      try {
        const entries = await prisma.timeEntry.findMany({
          where: { user_id: person.id, date: { gte: mondayOf(status.today), lte: status.today } },
          select: {
            date: true,
            minutes: true,
            project: { select: { name: true, client: { select: { name: true } } } },
          },
        });
        const token = await unsubscribeToken(secret, person.id);
        const off = `${appUrl}/reminders/off?u=${encodeURIComponent(person.id)}&t=${encodeURIComponent(token)}`;
        await mailer.send(
          buildWeeklyReminder({
            name: person.name,
            email: person.email,
            today: status.today,
            entries,
            appUrl,
            unsubscribeUrl: off,
            oneClickUrl: `${appUrl}/api/reminders/off?u=${encodeURIComponent(person.id)}&t=${encodeURIComponent(token)}`,
          }),
        );
        run.sent++;
      } catch (err) {
        run.failed++;
        logError("weekly_reminder_failed", err);
        // Undo the claim so the next hourly run can try again.
        await prisma.authUser.updateMany({
          where: { id: person.id, reminder_sent_week: status.week },
          data: { reminder_sent_week: previousWeek },
        });
      }
    }
    if (people.length < PAGE) break;
  }
  return run;
}

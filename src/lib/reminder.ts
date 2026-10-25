import type { MailMessage } from "@/lib/mailer";

import { formatDate } from "./dates";
import { renderEmail } from "./email-template";

/**
 * The weekly "log your hours" email: sent once a week, on Friday afternoon in the person's own time
 * zone, to people who turned it on. This file is the pure part: who is due, which week, and what it says.
 */
export const REMINDER_WEEKDAY = 5; // Friday
export const REMINDER_HOUR = 16; // 4 pm local; any later hour that day still counts, so a missed run catches up

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY = 86_400_000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.length > 0 && tz.length <= 64;
  } catch {
    return false;
  }
}

/** The calendar date, weekday (0 = Sunday) and hour (0 to 23) it is right now in `timeZone`. */
export function localParts(now: Date, timeZone: string): { date: string; weekday: number; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS.indexOf(String(parts.weekday)),
    hour: Number(parts.hour),
  };
}

const utc = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Monday of the week containing `isoDate`. */
export function mondayOf(isoDate: string): string {
  const dow = (new Date(utc(isoDate)).getUTCDay() + 6) % 7; // Mon = 0
  return toIso(utc(isoDate) - dow * DAY);
}

/** ISO week label such as 2026-W42, used to send at most one reminder per week. */
export function weekKey(isoDate: string): string {
  const d = new Date(utc(isoDate));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // the Thursday of this ISO week decides its year
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const week =
    1 + Math.round(((d.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Is this person due their reminder right now, and has this week's already gone out? */
export function isDue(
  now: Date,
  timeZone: string,
  lastSentWeek: string | null,
): { due: boolean; week: string; today: string } {
  const local = localParts(now, timeZone);
  const week = weekKey(local.date);
  return {
    due: local.weekday === REMINDER_WEEKDAY && local.hour >= REMINDER_HOUR && lastSentWeek !== week,
    week,
    today: local.date,
  };
}

/** True once this week's reminder time has passed (Friday 4 pm or later, and the weekend). */
export function reminderTimePassed(now: Date, timeZone: string): boolean {
  const { weekday, hour } = localParts(now, timeZone);
  return weekday === 6 || weekday === 0 || (weekday === REMINDER_WEEKDAY && hour >= REMINDER_HOUR);
}

// ----------------------------------------------------------------------------------- the email

type ReminderEntry = { date: string; minutes: number; project: { name: string; client: { name: string } } };

const hours = (minutes: number) => `${(Math.round((minutes / 60) * 100) / 100).toString()} h`;

/** Monday to Friday of the week that contains `today`. */
export function workDays(today: string): string[] {
  const monday = utc(mondayOf(today));
  return Array.from({ length: 5 }, (_, i) => toIso(monday + i * DAY));
}

export function buildWeeklyReminder(input: {
  name: string | null;
  email: string;
  today: string;
  entries: ReminderEntry[];
  appUrl: string;
  unsubscribeUrl: string;
  oneClickUrl: string;
}): MailMessage {
  const days = workDays(input.today);
  const byDay = new Map<string, number>();
  const projects = new Set<string>();
  let total = 0;
  for (const e of input.entries) {
    byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.minutes);
    projects.add(`${e.project.client.name} / ${e.project.name}`);
    total += e.minutes;
  }
  const first = (input.name ?? "").trim().split(/\s+/)[0];
  const missing = days.filter((d) => d <= input.today && !byDay.has(d)).length;
  const mail = renderEmail({
    title: "Your week so far",
    greeting: `Hi${first ? ` ${first}` : ""},`,
    blocks: [
      total > 0
        ? `Here's your week so far (${formatDate(days[0], "dayWithWeekday")} to ${formatDate(days[4], "dayWithWeekday")}):`
        : "You haven't logged any time this week yet:",
      {
        rows: days.map((d): [string, string] => [
          formatDate(d, "dayWithWeekday"),
          byDay.get(d) ? hours(byDay.get(d) as number) : "nothing logged",
        ]),
      },
      total > 0
        ? `Total: ${hours(total)} across ${projects.size} ${projects.size === 1 ? "project" : "projects"}.`
        : "Nothing logged so far.",
      ...(total > 0 && missing > 0
        ? [
            `${missing} ${missing === 1 ? "weekday has" : "weekdays have"} nothing logged. Worth a look before the weekend.`,
          ]
        : []),
      "Add or fix anything now:",
      { button: { label: "Open my week", url: `${input.appUrl}/dashboard/week` } },
    ],
    footnote: {
      text: "You're getting this because you turned on the Friday reminder.",
      link: { label: "Turn it off with one click", url: input.unsubscribeUrl },
    },
  });
  return {
    to: input.email,
    subject: total > 0 ? `Your week so far: ${hours(total)} logged` : "Friday check-in: time to log your hours?",
    text: mail.text,
    html: mail.html,
    headers: {
      "List-Unsubscribe": `<${input.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

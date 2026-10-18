import { z } from "zod";

import { parseDuration } from "@/lib/duration";

import { defineTool, type McpTool } from "./core";
import { type EntryRow, minutesFromArgs, needsDuration, shapeEntry } from "./entry-shape";
import { hours } from "./format";
import { date, durationText, minutesInt, noteText, projectRef } from "./inputs";
import { resolveProject } from "./lookup";

export const TIME_TOOLS: McpTool[] = [
  defineTool({
    name: "parse_duration",
    title: "Parse a duration",
    description: 'Turn text like "1h30", "1:30" or "2.5" into whole minutes, the way UseHourly reads it.',
    access: "read",
    idempotent: true,
    input: z.object({ text: durationText.describe("The duration text to read, e.g. 1h30") }),
    run: async (_c, a) => {
      const m = parseDuration(a.text);
      return m ? { minutes: m, hours: hours(m) } : { minutes: null, error: "Couldn't read that duration." };
    },
  }),

  // ---- logging time
  defineTool({
    name: "log_time",
    title: "Log time",
    description:
      "Add one time entry: a project, a date, how long, and what was done. Give minutes or a duration text. This adds a new entry; it never merges with an existing one. Check list_entries first if the day may already be logged.",
    access: "write",
    input: z
      .object({
        project: projectRef,
        date: date.describe("The day the work was done, YYYY-MM-DD"),
        minutes: minutesInt.optional().describe("Whole minutes worked (use this or duration)"),
        duration: durationText.optional().describe('Duration text such as "1h30" (use this or minutes)'),
        note: noteText.default("").describe("What was done (max 2,000 characters)"),
      })
      .refine(needsDuration, { message: "Give minutes or a duration." }),
    run: async (c, a) => {
      const p = await resolveProject(c, a.project);
      const created = (await c.entry.create({
        projectId: p.id,
        date: a.date,
        minutes: a.minutes,
        duration: a.duration,
        note: a.note,
      })) as EntryRow;
      return { logged: shapeEntry(created) };
    },
  }),

  defineTool({
    name: "log_time_on_days",
    title: "Log the same time on several days",
    description:
      "Add the same entry (project, minutes, note) on up to 31 dates. Days that already have time for this project are skipped and reported unless skip_existing is false.",
    access: "write",
    input: z
      .object({
        project: projectRef,
        dates: z.array(date).min(1).max(31).describe("The days to log, YYYY-MM-DD (1 to 31 dates)"),
        minutes: minutesInt.optional().describe("Whole minutes per day (use this or duration)"),
        duration: durationText.optional().describe('Duration text per day, such as "1h30" (use this or minutes)'),
        note: noteText.default("").describe("What was done (max 2,000 characters)"),
        skip_existing: z
          .boolean()
          .default(true)
          .describe("Skip days that already have time for this project (default true)"),
      })
      .refine(needsDuration, { message: "Give minutes or a duration." }),
    run: async (c, a) => {
      const p = await resolveProject(c, a.project);
      const minutes = minutesFromArgs(a) as number;
      const r = await c.entry.createMany({
        projectId: p.id,
        dates: a.dates,
        minutes,
        note: a.note,
        skipExisting: a.skip_existing,
      });
      return { project: p.label, minutes, ...r };
    },
  }),

  defineTool({
    name: "set_day_totals",
    title: "Set a project's total for days",
    description:
      "Set one project's total minutes for up to 31 days: more than 0 creates or updates that day's single entry, 0 clears it. Days that hold several entries or a running timer are skipped and reported, never merged. A note, when given, is applied to every day written.",
    access: "write",
    idempotent: true,
    input: z.object({
      project: projectRef,
      cells: z
        .array(
          z.object({
            date: date.describe("The day, YYYY-MM-DD"),
            minutes: z.number().int().min(0).max(1440).describe("Total minutes for that day; 0 clears it"),
          }),
        )
        .min(1)
        .max(31)
        .describe("One item per day to set (1 to 31 days)"),
      note: noteText.optional().describe("Description applied to every day written"),
    }),
    run: async (c, a) => {
      const p = await resolveProject(c, a.project);
      const r = await c.entry.bulkSet({ projectId: p.id, cells: a.cells, note: a.note });
      return { project: p.label, ...r };
    },
  }),

  defineTool({
    name: "update_entry",
    title: "Edit an entry",
    description: "Change an entry's project, date, minutes or note. Only the fields you pass change.",
    access: "write",
    idempotent: true,
    input: z
      .object({
        id: z.string().min(1).describe("The entry id (from list_entries)"),
        project: projectRef.optional().describe('Move the entry to this project: id or "Client / Project"'),
        date: date.optional().describe("Move the entry to this day, YYYY-MM-DD"),
        minutes: minutesInt.optional().describe("New whole minutes (use this or duration)"),
        duration: durationText.optional().describe('New duration text such as "1h30" (use this or minutes)'),
        note: noteText.optional().describe("New description (max 2,000 characters)"),
      })
      .refine((v) => [v.project, v.date, v.minutes, v.duration, v.note].some((x) => x !== undefined), {
        message: "Pass at least one field to change.",
      }),
    run: async (c, a) => {
      const projectId = a.project ? (await resolveProject(c, a.project)).id : undefined;
      const updated = (await c.entry.update({
        id: a.id,
        projectId,
        date: a.date,
        minutes: minutesFromArgs(a),
        note: a.note,
      })) as EntryRow;
      return { updated: shapeEntry(updated) };
    },
  }),

  defineTool({
    name: "merge_entries",
    title: "Merge entries",
    description:
      "Fold several entries (same project, same day) into the first one: minutes are added and notes joined. The others are removed.",
    access: "write",
    destructive: true,
    input: z.object({
      ids: z
        .array(z.string().min(1))
        .min(2)
        .max(20)
        .describe("Ids of the entries to merge; the first one is kept (2 to 20, same project and day)"),
    }),
    run: (c, a) => c.entry.merge(a),
  }),

  defineTool({
    name: "delete_entry",
    title: "Delete an entry",
    description: "Permanently delete one time entry. Confirm with the user before calling this.",
    access: "write",
    destructive: true,
    input: z.object({ id: z.string().min(1).describe("The entry id (from list_entries)") }),
    run: (c, a) => c.entry.delete(a),
  }),

  // ---- timer
  defineTool({
    name: "start_timer",
    title: "Start the timer",
    description:
      "Start a timer on a project. A timer that is already running is stopped first, so only one runs at a time.",
    access: "write",
    input: z.object({
      project: projectRef,
      date: date.describe("The day the timer starts on, YYYY-MM-DD"),
      note: noteText.default("").describe("What is being worked on (max 2,000 characters)"),
    }),
    run: async (c, a) => {
      const p = await resolveProject(c, a.project);
      const t = (await c.entry.start({ projectId: p.id, date: a.date, note: a.note })) as EntryRow;
      return { started: shapeEntry(t) };
    },
  }),

  defineTool({
    name: "stop_timer",
    title: "Stop the timer",
    description: "Stop the running timer. Elapsed time is rounded up to the next minute (at least 1).",
    access: "write",
    input: z.object({}),
    run: async (c) => ({ stopped: shapeEntry((await c.entry.stop()) as EntryRow) }),
  }),
];

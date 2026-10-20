import { z } from "zod";

import { addDays, fromISODate, MAX_QUERY_DAYS, spanDays } from "@/lib/dates";
import { appUrl } from "@/lib/mailer";
import { buildSheet, dateRange } from "@/lib/timesheet";
import { DEFAULT_SHARE_EXPIRY_DAYS, SHARE_EXPIRY_DAYS } from "@/lib/timesheet-share";

import { defineTool, type McpTool } from "./core";
import type { EntryRow } from "./entry-shape";
import { hours } from "./format";
import { clientRef, date, projectRef } from "./inputs";
import { resolveClient, resolveProject } from "./lookup";

/** The longest range the grid is built for: a quarter, which is what a timesheet is for. */
const MAX_GRID_DAYS = 93;
const range = (v: { from: string; to: string }) => v.from <= v.to;

/** Monday to Friday dates in [from, to] (YYYY-MM-DD), the days a freelancer is normally expected to have logged. */
const weekdays = (from: string, to: string) =>
  dateRange(from, to, addDays).filter((d) => ![0, 6].includes(fromISODate(d).getDay()));

export const TIMESHEET_READ_TOOLS: McpTool[] = [
  defineTool({
    name: "get_timesheet",
    title: "Get a timesheet",
    description:
      "The timesheet for a date range as a grid: one row per project, hours per day, totals per project and per day, and the weekdays with nothing logged. Optionally for one client or one project. Use this to 'show me my timesheet for last week' or to check a sheet before sharing it. Days marked non-billable still count here.",
    access: "read",
    idempotent: true,
    input: z
      .object({
        from: date.describe("First day to include, YYYY-MM-DD"),
        to: date.describe("Last day to include (inclusive), YYYY-MM-DD"),
        client: clientRef.optional().describe("Only this client: id or exact name"),
        project: projectRef.optional().describe('Only this project: id or "Client / Project"'),
      })
      .refine(range, { message: "from must be on or before to." })
      .refine((v) => spanDays(v.from, v.to) <= MAX_GRID_DAYS, {
        message: `Choose a range of up to ${MAX_GRID_DAYS} days for a timesheet.`,
      }),
    run: async (c, a) => {
      let rows = (await c.entry.list({ from: a.from, to: a.to })) as EntryRow[];
      let scope = "All clients";
      if (a.client) {
        const cl = await resolveClient(c, a.client);
        scope = cl.name;
        const ids = new Set(cl.projects.map((p) => p.id));
        rows = rows.filter((r) => ids.has(r.project.id));
      }
      if (a.project) {
        const p = await resolveProject(c, a.project);
        scope = p.label;
        rows = rows.filter((r) => r.project.id === p.id);
      }
      const timed = rows.filter((r) => r.minutes > 0);
      const sheet = buildSheet(
        timed.map((r) => ({
          id: r.id,
          project_id: r.project.id,
          date: r.date,
          minutes: r.minutes,
          note: r.note,
          started_at: r.started_at ?? null,
          project: {
            name: r.project.name,
            hourly_rate: 0,
            billable: true,
            client: { name: r.project.client.name, color: "" },
          },
        })),
      );
      const days = Object.keys(sheet.dayTotals).sort();
      return {
        from: a.from,
        to: a.to,
        scope,
        days,
        rows: sheet.rows.map((r) => ({
          client: r.client,
          project: r.project,
          label: `${r.client} / ${r.project}`,
          hours_by_day: Object.fromEntries(Object.entries(r.cells).map(([d, cell]) => [d, hours(cell.minutes)])),
          total_hours: hours(r.total),
        })),
        day_totals: Object.fromEntries(days.map((d) => [d, hours(sheet.dayTotals[d])])),
        total_hours: hours(sheet.total),
        weekdays_without_time: weekdays(a.from, a.to).filter((d) => !(d in sheet.dayTotals)),
      };
    },
  }),
];

export const TIMESHEET_WRITE_TOOLS: McpTool[] = [
  defineTool({
    name: "share_timesheet",
    title: "Create a timesheet link for a client",
    description:
      "Freeze the hours of a date range (optionally one client or project) into a private link a client can open without an account, read, print and approve. The link shows hours and, unless include_notes is false, the work descriptions; never rates or amounts. Anyone with the link can read it until it expires, so confirm the range, the client and whether to include notes with the user before calling. The link is returned only once: pass it on to the user. Not available on demo accounts.",
    access: "write",
    idempotent: false,
    input: z
      .object({
        from: date.describe("First day to include, YYYY-MM-DD"),
        to: date.describe("Last day to include (inclusive), YYYY-MM-DD"),
        client: clientRef.optional().describe("Only this client: id or exact name"),
        project: projectRef.optional().describe('Only this project: id or "Client / Project"'),
        include_notes: z.boolean().default(true).describe("Show the work descriptions to the client (default true)"),
        expires_in_days: z
          .number()
          .default(DEFAULT_SHARE_EXPIRY_DAYS)
          .describe(
            `How long the link works: ${SHARE_EXPIRY_DAYS.join(", ")} days (default ${DEFAULT_SHARE_EXPIRY_DAYS})`,
          ),
        title: z.string().trim().max(120).optional().describe("A heading for the sheet (default: client and dates)"),
      })
      .refine(range, { message: "from must be on or before to." })
      .refine((v) => spanDays(v.from, v.to) <= MAX_QUERY_DAYS, {
        message: `Choose a range of up to a year (${MAX_QUERY_DAYS} days).`,
      }),
    run: async (c, a) => {
      const clientId = a.client ? (await resolveClient(c, a.client)).id : undefined;
      const projectId = a.project ? (await resolveProject(c, a.project)).id : undefined;
      const { token } = await c.timesheetShare.create({
        from: a.from,
        to: a.to,
        clientId,
        projectId,
        includeNotes: a.include_notes,
        expiresInDays: a.expires_in_days,
        title: a.title,
      });
      return {
        url: `${appUrl()}/timesheet/${token}`,
        from: a.from,
        to: a.to,
        includes_notes: a.include_notes,
        expires_in_days: a.expires_in_days,
        note: "Give this link to the user to send to their client. It is not shown again. It can be turned off under Week > Share & export.",
      };
    },
  }),
];

/**
 * The terminal scene on the home page: a person asks Claude Code for a bigger job and it works through the UseHourly
 * MCP server. Data only, so a test can check every tool it shows is a real one and the numbers add up.
 */
export type Tone = "prompt" | "you" | "dim" | "tool" | "server" | "arg" | "ok" | "warn" | "link" | "text";

export type Seg =
  | { k: "line"; c: Tone; t: string } // appears at once
  | { k: "type"; c: Tone; t: string } // typed letter by letter
  | { k: "pause"; ms: number };

const line = (c: Tone, t: string): Seg => ({ k: "line", c, t });
const type = (c: Tone, t: string): Seg => ({ k: "type", c, t });
const pause = (ms: number): Seg => ({ k: "pause", ms });

/** One tool call: "● usehourly › tool args", then its result on the next line. */
const call = (tool: string, arg: string, ...result: Seg[]): Seg[] => [
  line("tool", "● "),
  line("server", "usehourly"),
  line("dim", " › "),
  line("tool", tool),
  line("arg", `${arg}\n`),
  line("dim", "  ⎿  "),
  ...result,
  pause(450),
];

export const TOOLS_SHOWN = ["list_clients", "get_timesheet", "log_time", "share_timesheet"] as const;

export const SCRIPT: Seg[] = [
  type("prompt", "❯ "),
  type("you", "Make last week's timesheet for every client. Flag any gaps, then give me sign-off links.\n"),
  pause(700),
  ...call("list_clients", "", line("text", "3 clients: Acme, Northwind, Fable Labs\n")),
  ...call(
    "get_timesheet",
    " Acme · Mon–Sun",
    line("text", "12:30 h · 4 projects · "),
    line("ok", "every weekday logged ✓\n"),
  ),
  ...call(
    "get_timesheet",
    " Northwind · Mon–Sun",
    line("text", "8:00 h · "),
    line("warn", "⚠ Tuesday has nothing logged\n"),
  ),
  ...call(
    "get_timesheet",
    " Fable Labs · Mon–Sun",
    line("text", "14:30 h · "),
    line("ok", "every weekday logged ✓\n\n"),
  ),
  line("text", "Northwind is missing Tuesday. Should I add something, or share it as it is?\n\n"),
  pause(900),
  type("prompt", "❯ "),
  type("you", "Log 2h on Support for that Tuesday, then share all three.\n"),
  pause(700),
  ...call("log_time", " Northwind / Support · Tue · 2h", line("ok", "✓ logged\n")),
  line("tool", "● "),
  line("server", "usehourly"),
  line("dim", " › "),
  line("tool", "share_timesheet"),
  line("arg", " ×3 · hours only · 30 days\n"),
  pause(500),
  line("dim", "  ⎿  "),
  line("ok", "✓ "),
  line("text", "Acme       "),
  line("link", "usehourly.app/timesheet/k7Qm…\n"),
  pause(260),
  line("dim", "     "),
  line("ok", "✓ "),
  line("text", "Northwind  "),
  line("link", "usehourly.app/timesheet/p2Xa…\n"),
  pause(260),
  line("dim", "     "),
  line("ok", "✓ "),
  line("text", "Fable Labs "),
  line("link", "usehourly.app/timesheet/9tLd…\n\n"),
  pause(700),
  line("text", "Done: 3 timesheets, 37 hours, 3 private links. Your clients can approve without an account.\n"),
];

/** What the finished screen shows (no pauses): for the still picture and for a screen reader. */
export const FINISHED = SCRIPT.filter((s): s is Exclude<Seg, { k: "pause" }> => s.k !== "pause").map((s) => ({
  c: s.c,
  t: s.t,
}));

export const FINISHED_TEXT = FINISHED.map((p) => p.t).join("");

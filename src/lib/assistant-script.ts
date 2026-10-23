/**
 * The terminal scene on the home page: a person asks Claude Code for a bigger job and it works through the UseHourly
 * MCP server. Data only, so a test can check every tool it shows is a real one and the numbers add up.
 */
export type Tone = "prompt" | "you" | "dim" | "tool" | "server" | "arg" | "ok" | "warn" | "link" | "text" | "ask";

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

export const TOOLS_SHOWN = ["list_clients", "get_timesheet", "log_time", "create_invoice"] as const;

/** One invoice line under the create_invoice call: client, number and total (rates 100, 90 and 80 an hour). */
const invoiceLine = (lead: string, client: string, number: string, amount: string, last = false): Seg[] => [
  line("dim", lead),
  line("ok", "✓ "),
  line("text", client),
  line("link", `${number}  ${amount}\n${last ? "\n" : ""}`),
  pause(260),
];

// The ending makes invoices, a feature this release shows (it used to make sign-off links, which are switched off).
export const SCRIPT: Seg[] = [
  type("prompt", "❯ "),
  type("you", "Make last week's timesheet for every client. Flag any gaps, then make the invoices.\n"),
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
  // The assistant asks before it acts: the question is in the terminal green, so it stands out.
  line("ask", "Northwind is missing Tuesday. Should I add something before I make the invoices?\n\n"),
  pause(900),
  type("prompt", "❯ "),
  type("you", "Log 2h on Support for that Tuesday, then make all three.\n"),
  pause(700),
  ...call("log_time", " Northwind / Support · Tue · 2h", line("ok", "✓ logged\n")),
  line("tool", "● "),
  line("server", "usehourly"),
  line("dim", " › "),
  line("tool", "create_invoice"),
  line("arg", " ×3 · last week · not invoiced yet\n"),
  pause(500),
  ...invoiceLine("  ⎿  ", "Acme       ", "INV-2026-014", "$1,250.00"),
  ...invoiceLine("     ", "Northwind  ", "INV-2026-015", "$900.00"),
  ...invoiceLine("     ", "Fable Labs ", "INV-2026-016", "$1,160.00", true),
  pause(440),
  line("text", "Done: 37 hours, 3 invoices, $3,310.00. Each PDF is ready on your Invoices page.\n"),
];

/** What the finished screen shows (no pauses): for the still picture and for a screen reader. */
export const FINISHED = SCRIPT.filter((s): s is Exclude<Seg, { k: "pause" }> => s.k !== "pause").map((s) => ({
  c: s.c,
  t: s.t,
}));

export const FINISHED_TEXT = FINISHED.map((p) => p.t).join("");

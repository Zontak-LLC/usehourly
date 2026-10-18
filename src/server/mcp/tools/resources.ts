export const RESOURCES = [
  {
    uri: "usehourly://projects",
    name: "projects",
    title: "Projects and clients",
    description: "Every active project with its client and rate.",
    mimeType: "application/json",
  },
  {
    uri: "usehourly://timer",
    name: "timer",
    title: "Running timer",
    description: "The running timer, if any.",
    mimeType: "application/json",
  },
] as const;

export const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "usehourly://entries/{from}/{to}",
    name: "entries",
    title: "Time entries in a date range",
    description: "Entries between two dates (YYYY-MM-DD), with totals.",
    mimeType: "application/json",
  },
] as const;

export type PromptArg = { name: string; description: string; required: boolean };
export const PROMPTS: {
  name: string;
  title: string;
  description: string;
  arguments: PromptArg[];
  build: (a: Record<string, string>) => string;
}[] = [
  {
    name: "log_session_time",
    title: "Log time for work just done",
    description: "Turn a description of finished work and how long it took into a UseHourly entry.",
    arguments: [
      { name: "date", description: "Local date, YYYY-MM-DD", required: true },
      { name: "duration", description: 'How long, e.g. "1h30"', required: true },
      { name: "what", description: "What was worked on", required: true },
      { name: "project", description: 'Project, as "Client / Project" (optional)', required: false },
    ],
    build: (a) =>
      `Log ${a.duration} on ${a.date} in UseHourly for this work: ${a.what}\n` +
      (a.project
        ? `Project: ${a.project}.\n`
        : "Work out the project with list_projects; if more than one fits, ask me which.\n") +
      "Check list_entries for that day first so nothing is logged twice. Write the note as one or two short sentences, past tense, plain words, leading with the outcome. Then call log_time and tell me what was logged.",
  },
  {
    name: "week_summary",
    title: "Summarize a week",
    description: "Hours per project and per day for the week starting on a Monday.",
    arguments: [{ name: "week_start", description: "The Monday, YYYY-MM-DD", required: true }],
    build: (a) =>
      `Use list_entries for the seven days starting ${a.week_start} (end on the Sunday). Give the total hours, hours per project and per day, and point out days with nothing logged. Keep it short.`,
  },
  {
    name: "invoice_client",
    title: "Prepare an invoice",
    description: "Review a client's unbilled time and issue an invoice after confirmation.",
    arguments: [
      { name: "client", description: "Client name", required: true },
      { name: "from", description: "First day to bill, YYYY-MM-DD", required: true },
      { name: "to", description: "Last day to bill, YYYY-MM-DD", required: true },
    ],
    build: (a) =>
      `Prepare an invoice for ${a.client} for ${a.from} to ${a.to}. List that client's entries in the period with list_entries, summarize hours and the amount per project (rates from list_projects), and show me the proposed invoice number from next_invoice_number. Do not call create_invoice until I confirm the dates, the period and the issue date.`,
  },
];

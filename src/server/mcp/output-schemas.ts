import { z } from "zod";

/**
 * What each tool returns, as the `outputSchema` clients see in tools/list. They describe the JSON a
 * successful call puts in `structuredContent`. Objects are loose so a field added later never makes
 * an older client reject a result; the journey test checks every real result against these, so a
 * schema that drifts from the tool fails there, not in someone's assistant.
 */

const obj = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);

const entry = obj({
  id: z.string().describe("Entry id"),
  date: z.string().describe("Local calendar date, YYYY-MM-DD"),
  minutes: z.number().describe("Whole minutes"),
  hours: z.number().describe("Hours, rounded to 2 decimals"),
  note: z.string().describe("What was done"),
  running: z.boolean().describe("True while the timer is running"),
  started_at: z.string().nullable().describe("ISO time the timer started, or null"),
  project: obj({ id: z.string(), name: z.string() }),
  client: obj({ id: z.string(), name: z.string() }),
});

const project = obj({
  id: z.string(),
  name: z.string(),
  client_id: z.string(),
  client: z.string().describe("Client name"),
  label: z.string().describe('"Client / Project"'),
  hourly_rate: z.number().describe("Dollars per hour"),
  hourly_rate_cents: z.number(),
  billable: z.boolean(),
});

const invoiceLine = obj({
  projectId: z.string(),
  project: z.string(),
  minutes: z.number(),
  rateCents: z.number(),
  amountCents: z.number(),
});

const bucket = {
  minutes: z.number(),
  billableMinutes: z.number(),
  earnedCents: z.number(),
};

const reportInvoice = obj({
  number: z.string(),
  client_name: z.string(),
  issue_date: z.string(),
  paid_date: z.string().nullable(),
  total_cents: z.number(),
  total_minutes: z.number(),
});

const ok = obj({ ok: z.literal(true) });

export const OUTPUT_SCHEMAS: Record<string, z.ZodType> = {
  // ---- reading
  whoami: obj({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string(),
    member_since: z.string().describe("ISO time the account was made"),
    token_access: z.enum(["read", "write"]).describe("What this token may do"),
    currency: z.string().describe("ISO 4217 code every amount is in, e.g. USD or EUR"),
    business: obj({
      name: z.string().nullable(),
      ein: z.string().nullable(),
      address: z.string().nullable(),
      payment_instructions: z.string().nullable(),
      has_logo: z.boolean(),
    }),
  }),
  list_projects: obj({
    projects: z.array(project),
    archived: z.array(project.extend({ archived: z.literal(true) })).optional(),
  }),
  list_clients: obj({
    clients: z.array(
      obj({
        id: z.string(),
        name: z.string(),
        color: z.string().nullable(),
        legal_name: z.string().nullable(),
        address: z.string().nullable(),
        currency: z.string().describe("The currency this client's rates and invoices are in"),
        projects: z.array(obj({ id: z.string(), name: z.string(), hourly_rate: z.number(), billable: z.boolean() })),
      }),
    ),
  }),
  get_client: obj({
    id: z.string(),
    name: z.string(),
    legal_name: z.string().nullable(),
    address: z.string().nullable(),
    currency: z.string().describe("The currency this client's rates and invoices are in"),
    has_logo: z.boolean(),
  }),
  list_entries: obj({
    from: z.string(),
    to: z.string(),
    summary: obj({
      total_minutes: z.number(),
      total_hours: z.number(),
      by_project: z.array(obj({ project: z.string(), client: z.string(), minutes: z.number(), hours: z.number() })),
      by_date: z.array(obj({ date: z.string(), minutes: z.number(), hours: z.number() })),
    }),
    entries: z.array(entry).describe("Newest first, at most 500"),
    truncated: z.boolean().describe("True when more than 500 entries matched"),
  }),
  project_totals: obj({
    from: z.string(),
    to: z.string(),
    projects: z.array(
      obj({ project: z.string(), id: z.string(), hours_in_range: z.number(), hours_all_time: z.number() }),
    ),
  }),
  get_running_timer: obj({
    running: entry.extend({ elapsed_minutes: z.number() }).nullable().describe("The running timer, or null"),
  }),
  annual_report: obj({
    year: z.number(),
    totals: obj({
      ...bucket,
      nonBillableMinutes: z.number(),
      entryCount: z.number(),
      workedDays: z.number(),
    }),
    months: z.array(obj({ ...bucket, month: z.number(), receivedCents: z.number() })),
    quarters: z.array(obj({ ...bucket, quarter: z.number(), receivedCents: z.number() })),
    projects: z.array(
      obj({
        ...bucket,
        projectId: z.string(),
        project: z.string(),
        clientId: z.string(),
        client: z.string(),
        billable: z.boolean(),
        rateCents: z.number(),
      }),
    ),
    clients: z.array(obj({ ...bucket, clientId: z.string(), client: z.string(), projects: z.number() })),
    invoices: obj({ count: z.number(), totalCents: z.number(), list: z.array(reportInvoice) }).describe(
      "Invoices issued in the year (accrual view)",
    ),
    received: obj({ count: z.number(), totalCents: z.number(), list: z.array(reportInvoice) }).describe(
      "Payments received in the year (cash view)",
    ),
    outstanding: obj({ count: z.number(), totalCents: z.number() }).describe(
      "Issued this year and still unpaid at year end",
    ),
  }),
  list_invoices: obj({
    count: z.number(),
    unpaid_total: z
      .number()
      .nullable()
      .describe("Still unpaid across the matches, in their currency; null when the matches use more than one currency"),
    unpaid_totals: z.record(z.string(), z.number()).describe("Still unpaid per currency code, e.g. { USD: 150 }"),
    invoices: z.array(
      obj({
        id: z.string(),
        number: z.string(),
        client: z.string(),
        issue_date: z.string(),
        due_date: z.string().nullable(),
        paid_date: z.string().nullable(),
        status: z.enum(["paid", "unpaid"]),
        period_from: z.string(),
        period_to: z.string(),
        hours: z.number(),
        total: z.number().describe("Dollars"),
        total_cents: z.number(),
        notes: z.string(),
      }),
    ),
  }),
  get_invoice: obj({
    id: z.string(),
    snapshot: obj({
      number: z.string(),
      issueDate: z.string(),
      dueDate: z.string().nullable(),
      periodFrom: z.string(),
      periodTo: z.string(),
      notes: z.string(),
      seller: obj({ name: z.string() }),
      client: obj({ name: z.string() }),
      lines: z.array(invoiceLine),
      detail: z.array(obj({ date: z.string(), project: z.string(), note: z.string(), minutes: z.number() })).optional(),
      totalMinutes: z.number(),
      totalCents: z.number(),
    }),
  }),
  next_invoice_number: obj({ number: z.string().describe("For example INV-2026-004") }),
  parse_duration: obj({
    minutes: z.number().nullable().describe("Whole minutes, or null when the text could not be read"),
    hours: z.number().optional(),
    error: z.string().optional(),
  }),

  // ---- logging time
  log_time: obj({ logged: entry }),
  log_time_on_days: obj({
    project: z.string().describe('"Client / Project"'),
    minutes: z.number().describe("Minutes logged on each day"),
    created: z.number().describe("Days that got an entry"),
    skipped: z.array(z.string()).describe("Days skipped because they already had time"),
  }),
  set_day_totals: obj({
    project: z.string().describe('"Client / Project"'),
    created: z.number(),
    updated: z.number(),
    deleted: z.number(),
    skipped: z.array(z.string()).describe("Days skipped: several entries or a running timer"),
  }),
  update_entry: obj({ updated: entry }),
  merge_entries: obj({
    id: z.string().describe("The kept entry"),
    minutes: z.number().describe("Its new total"),
    merged: z.number().describe("How many entries were folded together"),
  }),
  delete_entry: ok,

  // ---- timer
  start_timer: obj({ started: entry }),
  stop_timer: obj({ stopped: entry }),

  // ---- clients and projects
  create_client: obj({ client: obj({ id: z.string(), name: z.string(), color: z.string().nullable() }) }),
  update_client: obj({ ok: z.literal(true), client: z.string().describe("The client's name now") }),
  archive_client: obj({ ok: z.literal(true), archived: z.string().describe("The client's name") }),
  create_project: obj({
    project: obj({ id: z.string(), label: z.string(), hourly_rate: z.number(), billable: z.boolean() }),
  }),
  update_project: obj({
    project: obj({ id: z.string(), name: z.string(), hourly_rate: z.number(), billable: z.boolean() }),
  }),
  archive_project: obj({ ok: z.literal(true), archived: z.string().describe('"Client / Project"') }),
  unarchive_project: obj({ ok: z.literal(true), restored: z.string().describe('"Client / Project"') }),

  // ---- invoices
  create_invoice: obj({
    id: z.string(),
    number: z.string(),
    client: z.string(),
    period: z.string().describe('"YYYY-MM-DD to YYYY-MM-DD"'),
    hours: z.number(),
    total: z.number().describe("Dollars"),
    lines: z.array(invoiceLine).describe("One line per project"),
  }),
  mark_invoice_paid: obj({
    ok: z.literal(true),
    paidDate: z.string().nullable().describe("The paid date, or null when marked unpaid"),
  }),
  delete_invoice: ok,
};

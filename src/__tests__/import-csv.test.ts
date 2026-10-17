import { describe, expect, it } from "vitest";

import { DEFAULT_CLIENT, DEFAULT_PROJECT, MAX_IMPORT_ROWS, parseCsv, readTimeCsv } from "@/lib/import-csv";

const ok = (text: string, opts?: Parameters<typeof readTimeCsv>[1]) => {
  const r = readTimeCsv(text, opts);
  if (!r.ok) throw new Error(`expected a readable file, got: ${r.error}`);
  return r.preview;
};

const TOGGL = [
  '"User","Email","Client","Project","Task","Description","Billable","Start date","Start time","End date","End time","Duration","Tags","Amount (USD)"',
  '"Jo","jo@example.com","Acme","Website","","Homepage hero, first pass","Yes","2026-10-01","09:00:00","2026-10-01","10:30:00","01:30:00","","150.00"',
  '"Jo","jo@example.com","Acme","Website","","Fixed the nav\nand the footer","Yes","2026-10-02","13:00:00","2026-10-02","13:45:00","00:45:00","","75.00"',
  '"Jo","jo@example.com","Globex","Support","","Weekly call ""standup""","No","2026-10-02","15:00:00","2026-10-02","15:30:00","00:30:00","",""',
].join("\r\n");

const CLOCKIFY = [
  '"Project","Client","Description","Task","User","Group","Email","Tags","Billable","Start Date","Start Time","End Date","End Time","Duration (h)","Duration (decimal)","Billable Rate (USD)","Billable Amount (USD)"',
  '"Website","Acme","Landing page","","Jo","","jo@example.com","","Yes","10/01/2026","09:00:00 AM","10/01/2026","11:00:00 AM","02:00:00","2.00","85.00","170.00"',
  '"Website","Acme","Landing page","","Jo","","jo@example.com","","Yes","10/15/2026","09:00:00 AM","10/15/2026","09:20:00 AM","00:20:00","0.33","85.00","28.33"',
  '"","","No project entry","","Jo","","jo@example.com","","No","10/16/2026","09:00:00 AM","10/16/2026","09:15:00 AM","00:15:00","0.25","",""',
].join("\n");

describe("reading a Toggl export", () => {
  it("recognises the format and reads clients, projects, dates, minutes, notes and billable flags", () => {
    const p = ok(TOGGL);
    expect(p.format).toBe("toggl");
    expect(p.skipped).toEqual([]);
    expect(p.rows).toEqual([
      {
        client: "Acme",
        project: "Website",
        date: "2026-10-01",
        minutes: 90,
        note: "Homepage hero, first pass",
        billable: true,
        rateCents: null,
      },
      {
        client: "Acme",
        project: "Website",
        date: "2026-10-02",
        minutes: 45,
        note: "Fixed the nav\nand the footer",
        billable: true,
        rateCents: null,
      },
      {
        client: "Globex",
        project: "Support",
        date: "2026-10-02",
        minutes: 30,
        note: 'Weekly call "standup"',
        billable: false,
        rateCents: null,
      },
    ]);
    expect(p).toMatchObject({ totalMinutes: 165, from: "2026-10-01", to: "2026-10-02", clients: ["Acme", "Globex"] });
    expect(p.projects[0]).toEqual({ client: "Acme", project: "Website", entries: 2, minutes: 135 });
    expect(p.dateOrderAmbiguous).toBe(false); // ISO dates cannot be misread
  });
});

describe("reading a Clockify export", () => {
  it("reads US-style dates, exact HH:MM:SS durations (not the rounded decimals) and hourly rates", () => {
    const p = ok(CLOCKIFY);
    expect(p.format).toBe("clockify");
    expect(p.rows.map((r) => [r.date, r.minutes])).toEqual([
      ["2026-10-01", 120],
      ["2026-10-15", 20], // 0.33 h would have been 20 min too, but 00:20:00 is exact
      ["2026-10-16", 15],
    ]);
    expect(p.rows[0]).toMatchObject({ client: "Acme", project: "Website", billable: true, rateCents: 8500 });
    expect(p.rows[2]).toMatchObject({
      client: DEFAULT_CLIENT,
      project: DEFAULT_PROJECT,
      billable: false,
      rateCents: null,
    });
    expect(p.dateOrder).toBe("mdy");
    expect(p.dateOrderAmbiguous).toBe(false); // 10/15/2026 can only be month/day
  });
});

describe("dates written 03/04/2026", () => {
  const sheet = (...dates: string[]) =>
    ["Project,Date,Duration", ...dates.map((d, i) => `Alpha,${d},0${i + 1}:00:00`)].join("\n");

  it("reads day/month when a date proves it, and month/day when a date proves that", () => {
    const dmy = ok(sheet("25/10/2026", "03/04/2026"));
    expect(dmy.dateOrder).toBe("dmy");
    expect(dmy.dateOrderAmbiguous).toBe(false);
    expect(dmy.rows.map((r) => r.date)).toEqual(["2026-10-25", "2026-04-03"]);

    const mdy = ok(sheet("10/25/2026", "03/04/2026"));
    expect(mdy.rows.map((r) => r.date)).toEqual(["2026-10-25", "2026-03-04"]);
  });

  it("asks when it cannot tell, defaults to month/day, and flips when told", () => {
    const text = sheet("03/04/2026", "05/06/2026");
    const guess = ok(text);
    expect(guess).toMatchObject({ dateOrder: "mdy", dateOrderAmbiguous: true, dateSample: "03/04/2026" });
    expect(guess.rows.map((r) => r.date)).toEqual(["2026-03-04", "2026-05-06"]);
    const flipped = ok(text, { dateOrder: "dmy" });
    expect(flipped.rows.map((r) => r.date)).toEqual(["2026-04-03", "2026-06-05"]);
  });
});

describe("rows it cannot use", () => {
  it("skips them with the line number and a plain reason, and keeps the rest", () => {
    const p = ok(
      [
        "Client,Project,Date,Duration,Description",
        "Acme,Web,2026-10-01,01:00:00,fine",
        "Acme,Web,not a date,01:00:00,bad date",
        "Acme,Web,2026-02-31,01:00:00,impossible day",
        "Acme,Web,2026-10-02,00:00:20,twenty seconds",
        "Acme,Web,2026-10-03,,still running",
        "Acme,Web,2026-10-04,30:00:00,a day and a quarter",
        ",,,,",
      ].join("\n"),
    );
    expect(p.rows).toHaveLength(1);
    expect(p.skipped).toEqual([
      { line: 3, reason: 'Couldn\'t read the date "not a date"' },
      { line: 4, reason: 'Couldn\'t read the date "2026-02-31"' },
      { line: 5, reason: "Less than a minute" },
      { line: 6, reason: "No duration (a timer that was still running?)" },
      { line: 7, reason: "Longer than 24 hours" },
    ]);
  });

  it("explains a file with nothing usable, instead of importing nothing silently", () => {
    const r = readTimeCsv("Project,Date,Duration\nWeb,never,01:00:00");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("couldn't read any entries") });
  });
});

describe("files from other tools and locales", () => {
  it("reads a generic file with only Date, Project and Hours, including decimal commas and semicolons", () => {
    const p = ok("﻿Project;Date;Hours\nWebsite;2026-10-01;1,5\nWebsite;2026-10-02;0,25");
    expect(p.format).toBe("generic");
    expect(p.rows.map((r) => [r.client, r.project, r.minutes])).toEqual([
      [DEFAULT_CLIENT, "Website", 90],
      [DEFAULT_CLIENT, "Website", 15],
    ]);
  });

  it("understands durations written as 1:30, 1h30, 90m and decimal hours", () => {
    const p = ok(
      ["Date,Duration", "2026-10-01,1:30", "2026-10-01,1h30", "2026-10-01,90m", "2026-10-01,1.5"].join("\n"),
    );
    expect(p.rows.map((r) => r.minutes)).toEqual([90, 90, 90, 90]);
  });

  it("caps very long names and notes and says how many notes were cut", () => {
    const long = "x".repeat(3000);
    const p = ok(
      `Client,Project,Date,Duration,Description\n${"C".repeat(200)},${"P".repeat(200)},2026-10-01,1:00,${long}`,
    );
    expect(p.rows[0].client).toHaveLength(80);
    expect(p.rows[0].project).toHaveLength(80);
    expect(p.rows[0].note).toHaveLength(2000);
    expect(p.truncatedNotes).toBe(1);
  });

  it("keeps text that looks like a spreadsheet formula as plain text", () => {
    const p = ok('Project,Date,Duration,Description\nWeb,2026-10-01,1:00,"=HYPERLINK(""http://evil"")"');
    expect(p.rows[0].note).toBe('=HYPERLINK("http://evil")');
  });
});

describe("files it refuses, with a way forward", () => {
  it("says what is missing", () => {
    expect(readTimeCsv("Project,Duration\nWeb,1:00")).toMatchObject({
      ok: false,
      error: expect.stringContaining("date column"),
    });
    expect(readTimeCsv("Project,Date\nWeb,2026-10-01")).toMatchObject({
      ok: false,
      error: expect.stringContaining("duration column"),
    });
    expect(readTimeCsv("")).toMatchObject({ ok: false, error: expect.stringContaining("no time entries") });
    expect(readTimeCsv("Project,Date,Duration")).toMatchObject({ ok: false });
  });

  it("refuses files that are too large or have too many rows", () => {
    const many = `Date,Duration\n${"2026-10-01,1:00\n".repeat(MAX_IMPORT_ROWS + 1)}`;
    expect(readTimeCsv(many)).toMatchObject({ ok: false, error: expect.stringContaining("one year at a time") });
    expect(readTimeCsv("x".repeat(6 * 1024 * 1024))).toMatchObject({
      ok: false,
      error: expect.stringContaining("5 MB"),
    });
  });
});

describe("the CSV reader", () => {
  it("handles quotes, doubled quotes, line breaks inside quotes, CRLF and a missing final newline", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n"line\nbreak",z')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["line\nbreak", "z"],
    ]);
  });
});

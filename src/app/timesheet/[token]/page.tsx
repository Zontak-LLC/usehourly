import Link from "next/link";

import type { Metadata } from "next";

import { LogoMark } from "@/components/logo";
import { fromISODate } from "@/lib/dates";
import { formatDecimalHours, formatDuration } from "@/lib/duration";
import { getPrisma } from "@/lib/prisma";
import { parseSnapshot, type ShareSnapshot } from "@/lib/timesheet-share";
import { findShareByToken } from "@/server/timesheet-share";

import { ApproveForm } from "./_components/approve-form";
import { PrintButton } from "./_components/print-button";

// A private link: never indexed, never followed, and the address is not passed on when someone clicks out.
export const metadata: Metadata = {
  title: "Timesheet · UseHourly",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

const dayLabel = (iso: string) =>
  fromISODate(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fullDate = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-4xl items-center px-4 py-5 print:hidden">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <LogoMark className="size-7" />
          UseHourly
        </Link>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4 pb-16 print:pb-0">{children}</main>
    </div>
  );
}

/** Unknown, revoked and expired links all read the same, so a link cannot be used to find out which it was. */
function Unavailable() {
  return (
    <Frame>
      <div className="rounded-xl border bg-card p-6">
        <h1 className="font-semibold text-xl">This link isn't available any more</h1>
        <p className="mt-2 text-muted-foreground">
          The timesheet was turned off or has expired. Ask the person who sent it for a new link.
        </p>
      </div>
    </Frame>
  );
}

function Grid({ s }: { s: ShareSnapshot }) {
  // A few worked days read best as a grid; a long range reads best as a list by day.
  if (s.days.length <= 14) {
    return (
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Project</th>
              {s.days.map((d) => (
                <th key={d} className="px-3 py-2 text-right font-medium">
                  {dayLabel(d)}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => (
              <tr key={`${r.client}/${r.project}`} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <span className="font-medium">{r.project}</span>
                  <span className="block text-muted-foreground text-xs">{r.client}</span>
                </td>
                {r.minutes.map((m, i) => (
                  <td key={s.days[i]} className="px-3 py-2 text-right">
                    {m > 0 ? formatDuration(m) : ""}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-medium">{formatDuration(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-3 py-2">Total</td>
              {s.dayTotals.map((m, i) => (
                <td key={s.days[i]} className="px-3 py-2 text-right">
                  {formatDuration(m)}
                </td>
              ))}
              <td className="px-3 py-2 text-right">{formatDuration(s.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 text-right font-medium">Hours</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => (
              <tr key={`${r.client}/${r.project}`} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <span className="font-medium">{r.project}</span>
                  <span className="block text-muted-foreground text-xs">{r.client}</span>
                </td>
                <td className="px-3 py-2 text-right">{formatDuration(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Day</th>
              <th className="px-3 py-2 text-right font-medium">Hours</th>
            </tr>
          </thead>
          <tbody>
            {s.days.map((d, i) => (
              <tr key={d} className="border-b last:border-0">
                <td className="px-3 py-2">{dayLabel(d)}</td>
                <td className="px-3 py-2 text-right">{formatDuration(s.dayTotals[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function SharedTimesheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await findShareByToken(await getPrisma(), token);
  const now = Math.floor(Date.now() / 1000);
  const snapshot = share ? parseSnapshot(share.snapshot) : null;
  if (!share || !snapshot || share.revoked_at !== null || share.expires_at <= now) return <Unavailable />;

  return (
    <Frame>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">Timesheet from {snapshot.owner}</p>
          <h1 className="font-semibold text-2xl tracking-tight">{snapshot.title}</h1>
          <p className="text-muted-foreground text-sm">
            {formatDecimalHours(snapshot.total)} hours ({formatDuration(snapshot.total)}) in total
          </p>
        </div>
        <PrintButton />
      </div>

      <Grid s={snapshot} />

      {snapshot.notes && snapshot.notes.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <h2 className="font-semibold text-base">What was worked on</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {snapshot.notes.map((n) => (
              <li key={`${n.date}|${n.client}|${n.project}|${n.note}`} className="grid gap-0.5">
                <span className="text-muted-foreground tabular-nums">
                  {dayLabel(n.date)} · {n.project} · {formatDuration(n.minutes)}
                </span>
                <span className="whitespace-pre-wrap break-words">{n.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {share.approved_at !== null ? (
        <section className="flex flex-col gap-1 rounded-xl border border-success/40 bg-success-soft p-4">
          <h2 className="font-semibold text-base text-success">
            Approved by {share.approved_name} on {fullDate(share.approved_at)}
          </h2>
          {share.approved_note && <p className="whitespace-pre-wrap break-words text-sm">{share.approved_note}</p>}
        </section>
      ) : (
        <ApproveForm token={token} />
      )}

      <p className="text-muted-foreground text-xs print:hidden">
        Shared with UseHourly. This page shows hours only, and works until {fullDate(share.expires_at)}.
      </p>
    </Frame>
  );
}

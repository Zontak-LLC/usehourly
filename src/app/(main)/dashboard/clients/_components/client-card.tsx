"use client";

import { useState } from "react";

import Link from "next/link";

import { Archive, FileText, Pencil, Plus, X } from "lucide-react";

import { ClientCurrency, useMoney } from "@/components/currency-provider";
import { MoreMenu } from "@/components/more-menu";
import { Button } from "@/components/ui/button";
import { fromISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { count } from "@/lib/plural";

import { SetupForm } from "../../today/_components/setup-form";
import { ClientDetailsForm } from "./client-details-form";
import { type InvoiceFact, invoiceStatus } from "./client-facts";
import type { ClientRow, ProjectBudgets, ProjectTotals } from "./client-types";
import { PROJECT_COLS, ProjectEditCard, ProjectLine } from "./project-row";
import type { ProjectEditing } from "./use-project-editing";

/** The first few projects of a client; the rest are behind "Show all". */
const PROJECTS_SHOWN = 4;

/**
 * One client as a card (2026-10-23 redo): a header with the logo, the name and one line of facts, and on the right the
 * one thing people do here, "Add project", in words, plus ··· for the rare ones (billing details, archive). Under it the
 * projects as rows of one table whose columns line up on every card, each with a single Edit button. Always open: the
 * list is short, and a fold arrow was one more icon to puzzle over.
 */
export function ClientCard({
  client: c,
  allClients,
  logos,
  totals,
  budgets,
  editing,
  billingOpen,
  onToggleBilling,
  onCloseBilling,
  onArchiveClient,
  onArchiveProject,
  latestInvoice,
  today,
  quiet = false,
}: {
  client: ClientRow;
  allClients: ClientRow[] | undefined;
  logos: Record<string, string>;
  totals: ProjectTotals | undefined;
  budgets: ProjectBudgets | undefined;
  editing: ProjectEditing;
  billingOpen: boolean;
  onToggleBilling: () => void;
  onCloseBilling: () => void;
  onArchiveClient: () => void;
  onArchiveProject: (project: { id: string; name: string }) => void;
  /** The client's most recent invoice, shown in small text under the facts. */
  latestInvoice?: InvoiceFact;
  /** The browser's date (null until the page has loaded), for "12 days late". */
  today: string | null;
  /** No time logged this month: the header is drawn a little quieter. */
  quiet?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const hidden = showAll ? 0 : Math.max(0, c.projects.length - PROJECTS_SHOWN);
  const projects = hidden ? c.projects.slice(0, PROJECTS_SHOWN) : c.projects;
  const monthMinutes = c.projects.reduce((sum, p) => sum + (totals?.[p.id]?.range ?? 0), 0);
  // What this month's time is worth at the projects' rates (billable projects only): the number a freelancer bills.
  const monthCents = c.projects.reduce(
    (sum, p) =>
      p.billable && p.hourly_rate > 0 ? sum + Math.round(((totals?.[p.id]?.range ?? 0) * p.hourly_rate) / 60) : sum,
    0,
  );
  const editingHere = c.projects.some((p) => editing.editingId === p.id);
  return (
    <section
      aria-label={c.name}
      data-quiet={quiet || undefined}
      data-headerless="a client card: its header is the logo, name and buttons"
      className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10"
    >
      <ClientCurrency currency={c.currency}>
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:p-4">
          {/* A plain tile with the initial, in the client's own colour (the uploaded logo is for invoices). */}
          <span
            aria-hidden
            className={`grid size-10 shrink-0 place-items-center rounded-xl font-display font-extrabold text-base text-white ${quiet ? "opacity-50" : ""}`}
            style={{ background: c.color }}
          >
            {c.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0 flex-1">
            {/* A client with no time this month is quieter: lighter weight and a softer ink (still well above 4.5:1). */}
            <h2
              className={`truncate text-lg leading-tight ${quiet ? "font-medium text-foreground/80" : "font-semibold"}`}
            >
              {c.name}
            </h2>
            <p className="text-foreground/70 text-sm">
              {count(c.projects.length, "project")} · {formatDuration(monthMinutes)}
              {monthCents > 0 && (
                <>
                  {" · "}
                  <MonthValue cents={monthCents} />
                </>
              )}{" "}
              this month
            </p>
            {latestInvoice && <LastInvoiceLine invoice={latestInvoice} today={today} />}
          </div>
          <div className="flex items-center gap-2">
            {/* Time worth billing this month: one click to an invoice for this client (the builder picks the period). */}
            {monthCents > 0 && (
              <Button asChild variant="outline" className="h-10 gap-1.5">
                <Link href={`/dashboard/invoices/new?client=${c.id}`} aria-label={`Make an invoice for ${c.name}`}>
                  <FileText /> Make invoice
                </Link>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-1.5"
              aria-expanded={adding}
              aria-label={`Add a project for ${c.name}`}
              onClick={() => setAdding((now) => !now)}
            >
              <Plus /> Add project
            </Button>
            <MoreMenu
              label={`More actions for ${c.name}`}
              items={[
                {
                  label: billingOpen ? "Close billing details" : "Billing details",
                  icon: <Pencil />,
                  onSelect: onToggleBilling,
                },
                { label: "Archive client", icon: <Archive />, onSelect: onArchiveClient, destructive: true },
              ]}
            />
          </div>
        </header>

        {billingOpen && (
          <div className="border-t bg-muted/30 p-4 sm:p-5">
            <ClientDetailsForm id={c.id} onDone={onCloseBilling} />
          </div>
        )}

        {c.projects.length > 0 && !editingHere && (
          // Column titles (wide screens): the same columns on every client card, so the figures line up down the page.
          <div
            className={`${PROJECT_COLS} gap-x-3 border-t bg-band-3 px-3 py-1.5 text-foreground/60 text-xs max-sm:hidden sm:px-4`}
            aria-hidden
          >
            <span>Project</span>
            <span className="text-right">Rate</span>
            <span className="text-right">This month</span>
            <span className="text-right">All time</span>
            <span />
          </div>
        )}

        <ul className="border-t empty:hidden">
          {projects.map((p) =>
            editing.editingId === p.id ? (
              <ProjectEditCard
                key={p.id}
                project={p}
                clients={allClients}
                logos={logos}
                editing={editing}
                onArchive={() => onArchiveProject({ id: p.id, name: p.name })}
              />
            ) : (
              <ProjectLine
                key={p.id}
                project={p}
                clientColor={c.color}
                totals={totals}
                budget={budgets?.[p.id]}
                onEdit={() => editing.startEditing(p.id)}
              />
            ),
          )}
        </ul>

        {c.projects.length === 0 && !adding && (
          <p className="border-t px-3 py-3 text-foreground/70 text-sm sm:px-4">
            No projects yet. Use <span className="font-medium text-foreground">Add project</span> to start logging time
            for {c.name}.
          </p>
        )}

        {adding && (
          <div className="flex flex-col gap-2 border-t bg-muted/30 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-semibold text-sm">New project for {c.name}</p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-10 shrink-0"
                onClick={() => setAdding(false)}
                aria-label="Cancel"
              >
                <X />
              </Button>
            </div>
            <SetupForm clientId={c.id} bar onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
          </div>
        )}

        {(hidden > 0 || (showAll && c.projects.length > PROJECTS_SHOWN)) && (
          <div className="border-t px-3 py-2 sm:px-4">
            <Button type="button" variant="ghost" onClick={() => setShowAll((all) => !all)}>
              {showAll ? "Show fewer projects" : `Show all ${c.projects.length} projects`}
            </Button>
          </div>
        )}
      </ClientCurrency>
    </section>
  );
}

/** The month's value in the client's own currency (inside its ClientCurrency), in the text colour so it reads as the key figure. */
function MonthValue({ cents }: { cents: number }) {
  const money = useMoney();
  return <span className="font-semibold text-foreground">{money(cents)}</span>;
}

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const longDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

/** "Oct 20", with the year only when it is not this year. */
function niceDate(date: string, today: string | null) {
  const sameYear = today !== null && date.slice(0, 4) === today.slice(0, 4);
  return (sameYear ? shortDate : longDate).format(fromISODate(date));
}

/** "Last invoice INV-2026-004 · 12 days late" (or "· paid Oct 20", "· due Nov 3"). Lateness needs the browser's date. */
function LastInvoiceLine({ invoice, today }: { invoice: InvoiceFact; today: string | null }) {
  const status = today || invoice.paid_date ? invoiceStatus(invoice, today ?? "") : null;
  return (
    <p className="truncate text-foreground/70 text-xs">
      Last invoice {invoice.number}
      {status?.kind === "paid" && ` · paid ${niceDate(status.date, today)}`}
      {status?.kind === "due" && ` · due ${niceDate(status.date, today)}`}
      {status?.kind === "open" && " · not paid yet"}
      {status?.kind === "late" && (
        <>
          {" · "}
          <span className="font-medium text-destructive">{count(status.days, "day")} late</span>
        </>
      )}
    </p>
  );
}

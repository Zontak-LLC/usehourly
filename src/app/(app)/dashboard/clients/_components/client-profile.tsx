"use client";

import { type KeyboardEvent, useRef, useState } from "react";

import { Archive, Pencil } from "lucide-react";

import { ClientInitial } from "@/components/client-initial";
import { ClientCurrency, useMoney } from "@/components/currency-provider";
import { MoreMenu } from "@/components/more-menu";
import { usualRate } from "@/lib/client-list";
import { formatDuration } from "@/lib/duration";
import { ROW_FIGURE } from "@/lib/figures";
import type { Unbilled } from "@/lib/unbilled";

import { BillBar } from "./bill-bar";
import { ClientDetailsForm } from "./client-details-form";
import type { InvoiceFact } from "./client-facts";
import type { ClientRow, ProjectBudgets, ProjectTotals } from "./client-types";
import { ProfileInvoices, ProfileTime } from "./profile-activity";
import { ProfileProjects } from "./profile-projects";
import type { ProjectEditing } from "./use-project-editing";

type Tab = "projects" | "time" | "invoices" | "billing";
type InvoiceRow = InvoiceFact & { id: string; total_cents: number; currency: string };

/**
 * One client's profile, the right half of the split view (issue 238): the initial, name, email and usual rate with
 * ··· (Billing details, Archive client); three calm figures (Not invoiced, This month, All time); tabs for Projects,
 * Time, Invoices and Billing details; and the bill bar pinned to its foot while the client has time to bill.
 */
export function ClientProfile({
  client: c,
  allClients,
  logos,
  totals,
  budgets,
  editing,
  unbilled,
  invoices,
  month,
  today,
  onArchiveClient,
  onArchiveProject,
}: {
  client: ClientRow;
  allClients: ClientRow[] | undefined;
  logos: Record<string, string>;
  totals: ProjectTotals | undefined;
  budgets: ProjectBudgets | undefined;
  editing: ProjectEditing;
  unbilled: Unbilled | undefined;
  invoices: readonly InvoiceRow[];
  month: { from: string; to: string };
  today: string | null;
  onArchiveClient: () => void;
  onArchiveProject: (project: { id: string; name: string }) => void;
}) {
  const [tab, setTab] = useState<Tab>("projects");
  const [adding, setAdding] = useState(false);
  const monthMinutes = c.projects.reduce((sum, p) => sum + (totals?.[p.id]?.range ?? 0), 0);
  const allMinutes = c.projects.reduce((sum, p) => sum + (totals?.[p.id]?.total ?? 0), 0);
  const rate = usualRate(c.projects, (id) => totals?.[id]?.total ?? 0);
  const invoiceCount = invoices.filter((i) => i.client_id === c.id).length;
  // A form with its own solid Save is open (Billing, editing a project, adding one): the bill bar's button steps down
  // (one solid button per screen), and on a phone the bar stops covering the form.
  const formOpen = tab === "billing" || adding || c.projects.some((p) => editing.editingId === p.id);

  const tabs: { id: Tab; label: string }[] = [
    { id: "projects", label: `Projects · ${c.projects.length}` },
    { id: "time", label: "Time" },
    { id: "invoices", label: invoiceCount ? `Invoices · ${invoiceCount}` : "Invoices" },
    { id: "billing", label: "Billing" }, // "Billing details" was cut to "Billing deta" on a 390 px phone
  ];

  return (
    <section aria-label={c.name} className="flex min-h-[30rem] min-w-0 flex-1 flex-col">
      <ClientCurrency currency={c.currency}>
        <div className="flex flex-1 flex-col gap-4 p-3 sm:p-5">
          <header className="flex items-center gap-3">
            <ClientInitial name={c.name} colour={c.color} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-bold font-display text-2xl leading-tight">{c.name}</h2>
              <ProfileFacts email={c.email} rate={rate} />
            </div>
            <MoreMenu
              label={`More actions for ${c.name}`}
              items={[
                {
                  label: tab === "billing" ? "Close billing details" : "Billing details",
                  icon: <Pencil />,
                  onSelect: () => setTab(tab === "billing" ? "projects" : "billing"),
                },
                { label: "Archive client", icon: <Archive />, onSelect: onArchiveClient, destructive: true },
              ]}
            />
          </header>

          <Figures unbilledCents={unbilled?.cents ?? 0} monthMinutes={monthMinutes} allMinutes={allMinutes} />

          <Tabs tabs={tabs} value={tab} onChange={setTab} clientId={c.id} />

          <div role="tabpanel" id={`client-${c.id}-panel`} aria-labelledby={`client-${c.id}-tab-${tab}`}>
            {tab === "projects" && (
              <ProfileProjects
                client={c}
                allClients={allClients}
                logos={logos}
                totals={totals}
                budgets={budgets}
                editing={editing}
                adding={adding}
                onAddingChange={setAdding}
                onArchiveProject={onArchiveProject}
              />
            )}
            {tab === "time" && <ProfileTime client={c} month={month} today={today} />}
            {tab === "invoices" && <ProfileInvoices client={c} invoices={invoices} today={today} />}
            {tab === "billing" && <ClientDetailsForm id={c.id} onDone={() => setTab("projects")} />}
          </div>
        </div>

        {unbilled && unbilled.cents > 0 && (
          <BillBar clientId={c.id} clientName={c.name} unbilled={unbilled} today={today} quiet={formOpen} />
        )}
      </ClientCurrency>
    </section>
  );
}

/** "accounts@fablelabs.io · usually $95/h" (each part only when known). */
function ProfileFacts({ email, rate }: { email: string | null; rate: number | null }) {
  const money = useMoney();
  const parts = [email, rate ? `usually ${money(rate)}/h` : null].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="truncate text-foreground/70 text-sm">{parts.join(" · ")}</p>;
}

/** Three calm figures of equal weight (ROW_FIGURE, no amber): the money waiting, this month, all time. */
function Figures({
  unbilledCents,
  monthMinutes,
  allMinutes,
}: {
  unbilledCents: number;
  monthMinutes: number;
  allMinutes: number;
}) {
  const money = useMoney();
  const items = [
    { label: "Not invoiced", value: money(unbilledCents) },
    { label: "This month", value: formatDuration(monthMinutes) },
    { label: "All time", value: formatDuration(allMinutes) },
  ];
  return (
    <dl className="grid grid-cols-3 gap-2" data-testid="client-figures">
      {items.map((f) => (
        <div key={f.label} className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted/70 px-3 py-2.5">
          <dt className="font-mono text-[10.5px] text-foreground/70 uppercase tracking-wider">{f.label}</dt>
          <dd className={`truncate ${ROW_FIGURE}`}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Flat underline tabs (arrow keys move along them, like the Account tabs). */
function Tabs({
  tabs,
  value,
  onChange,
  clientId,
}: {
  tabs: { id: Tab; label: string }[];
  value: Tab;
  onChange: (tab: Tab) => void;
  clientId: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label="Client details" className="flex gap-5 overflow-x-auto border-b text-sm">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`client-${clientId}-tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`client-${clientId}-panel`}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
          className={`min-h-11 shrink-0 whitespace-nowrap pb-1 ${
            value === t.id
              ? "font-semibold text-foreground shadow-[inset_0_-2px_0_var(--foreground)]"
              : "text-foreground/70 hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

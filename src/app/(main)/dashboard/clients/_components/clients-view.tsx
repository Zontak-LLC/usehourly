"use client";

import { useState } from "react";

import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { useProjectLogos } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

import { ArchiveConfirmDialog, type ArchiveTarget } from "./archive-confirm-dialog";
import { ArchivedSection } from "./archived-section";
import { ClientCard } from "./client-card";
import type { ClientRow, ProjectTotals } from "./client-types";
import { NewClientDialog } from "./new-client-dialog";
import { useProjectEditing } from "./use-project-editing";

/** The three figures under the page title. */
function ClientStats({ clients, totals }: { clients: ClientRow[]; totals: ProjectTotals | undefined }) {
  return (
    <dl className="grid grid-cols-3 gap-2 sm:gap-3">
      <div className="rounded-lg bg-muted/50 px-3 py-3">
        <dt className="text-muted-foreground text-xs">Clients</dt>
        <dd className="font-mono font-semibold text-base tabular-nums sm:text-xl">{clients.length}</dd>
      </div>
      <div className="rounded-lg bg-muted/50 px-3 py-3">
        <dt className="text-muted-foreground text-xs">Projects</dt>
        <dd className="font-mono font-semibold text-base tabular-nums sm:text-xl">
          {clients.reduce((a, c) => a + c.projects.length, 0)}
        </dd>
      </div>
      <div className="rounded-lg bg-muted/50 px-3 py-3">
        <dt className="text-muted-foreground text-xs">Logged this month</dt>
        <dd className="font-mono font-semibold text-base tabular-nums sm:text-xl">
          {formatDuration(Object.values(totals ?? {}).reduce((a, t) => a + t.range, 0))}
        </dd>
      </div>
    </dl>
  );
}

function ClientSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <search aria-label="Find clients and projects" className="relative block">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search clients and projects…"
        aria-label="Search clients and projects"
        className="h-11 pl-9 text-base"
      />
    </search>
  );
}

/** A client matches by its name (then all its projects show) or by any of its projects' names. */
function filterClients(clients: ClientRow[], words: string[]): ClientRow[] {
  return clients.flatMap((c) => {
    if (words.length === 0) return [c];
    const clientHit = words.every((w) => c.name.toLowerCase().includes(w));
    const projects = clientHit
      ? c.projects
      : c.projects.filter((p) => words.every((w) => `${p.name} ${c.name}`.toLowerCase().includes(w)));
    return clientHit || projects.length > 0 ? [{ ...c, projects }] : [];
  });
}

export function ClientsView() {
  const utils = trpc.useUtils();
  const clients = trpc.clients.list.useQuery();
  const archiveClient = trpc.clients.archive.useMutation();
  const archiveProject = trpc.project.archive.useMutation();
  const unarchiveClient = trpc.clients.unarchive.useMutation();
  const unarchiveProject = trpc.project.unarchive.useMutation();
  const [newOpen, setNewOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const logos = useProjectLogos();
  const editing = useProjectEditing();
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState<ArchiveTarget | null>(null);

  // Month bounds come from the browser clock (the Worker runs in UTC).
  const [month] = useState(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toISODate(first), to: toISODate(last) };
  });
  const totals = trpc.project.totals.useQuery(month);
  const budgets = trpc.project.budgets.useQuery(month);

  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const visibleClients = filterClients(clients.data ?? [], words);

  async function archive({ kind, id, name }: ArchiveTarget) {
    setConfirming(null);
    try {
      await (kind === "client" ? archiveClient : archiveProject).mutateAsync({ id });
      await Promise.all([
        utils.clients.list.invalidate(),
        utils.clients.listArchived.invalidate(),
        utils.project.listArchived.invalidate(),
      ]);
      toast.success(`${name} archived. Your logged time is kept.`, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await (kind === "client" ? unarchiveClient : unarchiveProject).mutateAsync({ id });
              await Promise.all([utils.clients.list.invalidate(), utils.project.listArchived.invalidate()]);
            } catch (err) {
              toastError(err, "Couldn't undo that.");
            }
          },
        },
      });
    } catch (err) {
      toastError(err, "Couldn't archive that.");
    }
  }

  return (
    <PageShell
      title="Clients & Projects"
      description="Your clients, and the projects you do for each. Hourly rates live here."
      actions={
        <Button type="button" size="lg" variant="primary" className="h-10" onClick={() => setNewOpen(true)}>
          <Plus /> New client
        </Button>
      }
    >
      {(clients.data?.length ?? 0) > 0 && (
        <>
          <ClientStats clients={clients.data ?? []} totals={totals.data} />
          <ClientSearch value={search} onChange={setSearch} />
        </>
      )}
      <ArchiveConfirmDialog target={confirming} onCancel={() => setConfirming(null)} onConfirm={archive} />

      {/* The page's header card: what this page is, the button to add a client, and the numbers at a glance. */}

      <NewClientDialog open={newOpen} onOpenChange={setNewOpen} clientCount={clients.data?.length ?? 0} />

      {clients.isLoading && <Skeleton className="h-32 w-full" />}
      {clients.error && <p className="text-destructive text-sm">Couldn't load clients: {clients.error.message}</p>}

      {words.length > 0 && visibleClients.length === 0 && (
        <p className="py-6 text-center text-muted-foreground text-sm">No client or project matches that.</p>
      )}

      {visibleClients.map((c) => (
        <ClientCard
          key={c.id}
          client={c}
          allClients={clients.data}
          logos={logos}
          totals={totals.data}
          budgets={budgets.data}
          editing={editing}
          billingOpen={editingClientId === c.id}
          onToggleBilling={() => setEditingClientId(editingClientId === c.id ? null : c.id)}
          onCloseBilling={() => setEditingClientId(null)}
          onArchiveClient={() => setConfirming({ kind: "client", id: c.id, name: c.name })}
          onArchiveProject={(p) => setConfirming({ kind: "project", ...p })}
        />
      ))}

      {clients.data?.length === 0 && (
        <p className="py-10 text-center text-muted-foreground text-sm">No clients yet. Use New client above.</p>
      )}
      <ArchivedSection />
    </PageShell>
  );
}

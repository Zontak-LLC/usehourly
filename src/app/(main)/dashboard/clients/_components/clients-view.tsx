"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Archive, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { MoreMenu } from "@/components/more-menu";
import { PageShell } from "@/components/page-shell";
import { useProjectLogos } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { feature } from "@/lib/features";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";
import { useToday } from "@/lib/use-today";

import { ClientCard } from "./client-card";
import { latestInvoiceByClient, orderClients } from "./client-facts";
import type { ClientRow } from "./client-types";
import { NewClientCard } from "./new-client-card";
import { useProjectEditing } from "./use-project-editing";

/** The search box shows from this many clients up. */
const SEARCH_FROM = 5;

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
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const logos = useProjectLogos();
  const editing = useProjectEditing();
  const [search, setSearch] = useState("");

  // Month bounds come from the browser clock (the Worker runs in UTC).
  const [month] = useState(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toISODate(first), to: toISODate(last) };
  });
  const totals = trpc.project.totals.useQuery(month);
  // Budgets are hidden in this release, so their usage is not even asked for.
  const budgets = trpc.project.budgets.useQuery(month, { enabled: feature("budgets") });
  // Each client's latest invoice, for the small line under its name. Started here with the other queries (same render)
  // so the page stays ONE batched request; no input, so it shares the Invoices page's cached list.
  const invoices = trpc.invoice.list.useQuery();
  const latestInvoices = latestInvoiceByClient(invoices.data ?? []);
  // Each client's time not invoiced yet (same render, so still one batched request).
  const unbilled = trpc.invoice.unbilled.useQuery();
  const today = useToday();

  // The old stat tiles as one line under the title: how many clients and projects, and the month's time so far.
  const clientCount = clients.data?.length ?? 0;
  const projectCount = (clients.data ?? []).reduce((n, c) => n + c.projects.length, 0);
  const monthMinutes = Object.values(totals.data ?? {}).reduce((sum, t) => sum + t.range, 0);
  const description =
    clientCount === 0
      ? "Your clients and the projects you log time on. Hourly rates live here."
      : `${clientCount} client${clientCount === 1 ? "" : "s"} · ${projectCount} project${projectCount === 1 ? "" : "s"}${
          totals.data ? ` · ${formatDuration(monthMinutes)} logged this month` : ""
        }`;

  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const visibleClients = filterClients(clients.data ?? [], words);
  // Clients with time this month first; the quiet ones (none this month) below, each group alphabetical.
  const ordered = orderClients(visibleClients, (c) =>
    totals.data ? c.projects.reduce((sum, p) => sum + (totals.data?.[p.id]?.range ?? 0), 0) : undefined,
  );

  // Archiving needs no "Are you sure?": it is fully reversible, and the toast offers Undo (docs/ui-spec.md).
  async function archive({ kind, id, name }: { kind: "client" | "project"; id: string; name: string }) {
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
              await Promise.all([
                utils.clients.list.invalidate(),
                utils.project.listArchived.invalidate(),
                utils.clients.listArchived.invalidate(),
              ]);
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

  const [newClientOpen, setNewClientOpen] = useState(false);
  const router = useRouter();
  return (
    <PageShell
      nav="clients"
      title="Clients"
      description={description}
      descriptionOnPhone
      actions={
        // The way to add a client: "New client" in the header, in words (the form opens at the top of the list). The big dashed card is only for an empty page.
        <div className="flex items-center gap-1">
          {clientCount > 0 && (
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-1.5"
              aria-label="New client"
              aria-expanded={newClientOpen}
              onClick={() => setNewClientOpen((open) => !open)}
            >
              <Plus /> New client
            </Button>
          )}
          {/* The archive is one step away, not a link at the foot of a long page. */}
          <MoreMenu
            label="More actions for Clients"
            className="size-10"
            items={[
              {
                label: "Archived clients and projects",
                icon: <Archive />,
                onSelect: () => router.push("/dashboard/clients/archived"),
              },
            ]}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Search only earns its place once there are more clients than fit in a glance. */}
        {(clients.data?.length ?? 0) > SEARCH_FROM && <ClientSearch value={search} onChange={setSearch} />}

        {/* The page's header card: what this page is, the button to add a client, and the numbers at a glance. */}

        {clients.isLoading && <Skeleton className="h-32 w-full" />}
        {clients.error && <p className="text-destructive text-sm">Couldn't load clients: {clients.error.message}</p>}

        {words.length > 0 && visibleClients.length === 0 && (
          <p className="py-6 text-center text-muted-foreground text-sm">No client or project matches that.</p>
        )}

        {/* The form (or, on an empty page, the big card) sits at the top; not while searching or before the list loads. */}
        {clients.data && words.length === 0 && (
          <NewClientCard clientCount={clients.data.length} open={newClientOpen} onOpenChange={setNewClientOpen} />
        )}

        {ordered.map(({ client: c, quiet }) => (
          <ClientCard
            key={c.id}
            client={c}
            quiet={quiet}
            latestInvoice={latestInvoices.get(c.id)}
            unbilledCents={unbilled.data?.find((u) => u.clientId === c.id)?.cents ?? 0}
            today={today}
            allClients={clients.data}
            logos={logos}
            totals={totals.data}
            budgets={budgets.data}
            editing={editing}
            billingOpen={editingClientId === c.id}
            onToggleBilling={() => setEditingClientId(editingClientId === c.id ? null : c.id)}
            onCloseBilling={() => setEditingClientId(null)}
            onArchiveClient={() => void archive({ kind: "client", id: c.id, name: c.name })}
            onArchiveProject={(p) => void archive({ kind: "project", ...p })}
          />
        ))}
      </div>
    </PageShell>
  );
}

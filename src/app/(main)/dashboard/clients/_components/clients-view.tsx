"use client";

import { useState } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Archive, ChevronLeft, Plus } from "lucide-react";
import { toast } from "sonner";

import { useAccountCurrency } from "@/components/currency-provider";
import { MoreMenu } from "@/components/more-menu";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { useProjectLogos } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { clientIdFromPath, clientListLine, clientPath, defaultClientId, groupClientList } from "@/lib/client-list";
import { toISODate } from "@/lib/dates";
import { feature } from "@/lib/features";
import { effectiveCurrency, formatMoney } from "@/lib/money";
import { count } from "@/lib/plural";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";
import { useToday } from "@/lib/use-today";

import { ClientListPane, type ListItem } from "./client-list-pane";
import { ClientProfile } from "./client-profile";
import type { ClientRow, ProjectTotals } from "./client-types";
import { NewClientCard } from "./new-client-card";
import { useProjectEditing } from "./use-project-editing";

/** The search box shows from this many clients up. */
const SEARCH_FROM = 2;

/** A client matches by its name or by any of its projects' names. */
function matches(c: ClientRow, words: string[]): boolean {
  if (words.length === 0) return true;
  const text = `${c.name} ${c.projects.map((p) => p.name).join(" ")}`.toLowerCase();
  return words.every((w) => text.includes(w));
}

const clientMinutes = (c: ClientRow, totals: ProjectTotals | undefined, key: "range" | "total") =>
  c.projects.reduce((sum, p) => sum + (totals?.[p.id]?.[key] ?? 0), 0);

const lastDay = (c: ClientRow, totals: ProjectTotals | undefined) =>
  c.projects.reduce<string | null>((last, p) => {
    const d = totals?.[p.id]?.last ?? null;
    return d && (!last || d > last) ? d : last;
  }, null);

/**
 * Clients as a split view (issue 238, design 3 variation B): the list on the left (clients with time to bill first,
 * with their amounts), the chosen client's profile on the right with the bill bar pinned to its foot. Each client has
 * its own address (`/dashboard/clients/<id>`): on a wide screen the list stays beside it, on a phone the list and the
 * profile are two screens. Choosing a client changes the address in place (history.pushState, which Next follows), so
 * the search and the scroll stay.
 */
export function ClientsView() {
  const utils = trpc.useUtils();
  const router = useRouter();
  const pathname = usePathname();
  const routeId = clientIdFromPath(pathname);
  const clients = trpc.clients.list.useQuery();
  const archiveClient = trpc.clients.archive.useMutation();
  const archiveProject = trpc.project.archive.useMutation();
  const unarchiveClient = trpc.clients.unarchive.useMutation();
  const unarchiveProject = trpc.project.unarchive.useMutation();
  const logos = useProjectLogos();
  const editing = useProjectEditing();
  const [search, setSearch] = useState("");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const accountCurrency = useAccountCurrency();

  // Month bounds come from the browser clock (the Worker runs in UTC).
  const [month] = useState(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toISODate(first), to: toISODate(last) };
  });
  // Every query the page needs starts in this render, so they go out as ONE batched request.
  const totals = trpc.project.totals.useQuery(month);
  const budgets = trpc.project.budgets.useQuery(month, { enabled: feature("budgets") });
  const invoices = trpc.invoice.list.useQuery();
  const unbilled = trpc.invoice.unbilled.useQuery();
  const today = useToday();

  const unbilledOf = (id: string) => unbilled.data?.find((u) => u.clientId === id);
  const currencyOf = (c: ClientRow) => effectiveCurrency(c.currency, accountCurrency);
  const all = clients.data ?? [];
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = groupClientList(
    all.filter((c) => matches(c, words)),
    (c) => unbilledOf(c.id)?.cents ?? 0,
    (c) => (totals.data ? clientMinutes(c, totals.data, "range") : undefined),
  );
  const item = (c: ClientRow, quiet = false): ListItem => {
    const u = unbilledOf(c.id);
    return {
      client: c,
      quiet,
      line: clientListLine(clientMinutes(c, totals.data, "range"), lastDay(c, totals.data), today),
      amount: u && u.cents > 0 ? formatMoney(u.cents, currencyOf(c)) : undefined,
    };
  };

  // The list's order needs what is waiting to be billed, so a wide screen picks its first client only once that is in.
  const orderReady = Boolean(clients.data) && (unbilled.data !== undefined || unbilled.isError);
  const fullGroups = groupClientList(
    all,
    (c) => unbilledOf(c.id)?.cents ?? 0,
    (c) => (totals.data ? clientMinutes(c, totals.data, "range") : undefined),
  );
  const selectedId = routeId ?? (orderReady ? defaultClientId(fullGroups) : null);
  const selected = all.find((c) => c.id === selectedId);

  function openClient(id: string | null) {
    const path = id ? clientPath(id) : "/dashboard/clients";
    if (path !== pathname) window.history.pushState(null, "", path);
  }

  // The header line: how many clients, and the money waiting when it is all in one currency.
  const waiting = all.flatMap((c) => {
    const u = unbilledOf(c.id);
    return u && u.cents > 0 ? [{ cents: u.cents, currency: currencyOf(c) }] : [];
  });
  const oneCurrency = waiting.length > 0 && waiting.every((w) => w.currency === waiting[0].currency);
  const description =
    all.length === 0
      ? "Your clients and the projects you log time on. Hourly rates live here."
      : `${count(all.length, "client")}${
          oneCurrency
            ? ` · ${formatMoney(
                waiting.reduce((s, w) => s + w.cents, 0),
                waiting[0].currency,
              )} not invoiced yet`
            : ` · ${count(
                all.reduce((n, c) => n + c.projects.length, 0),
                "project",
              )}`
        }`;

  // Archiving needs no "Are you sure?": it is fully reversible, and the toast offers Undo (docs/ui-spec.md).
  async function archive({ kind, id, name }: { kind: "client" | "project"; id: string; name: string }) {
    const refresh = () =>
      Promise.all([
        utils.clients.list.invalidate(),
        utils.clients.listArchived.invalidate(),
        utils.project.listArchived.invalidate(),
        utils.invoice.unbilled.invalidate(),
      ]);
    try {
      await (kind === "client" ? archiveClient : archiveProject).mutateAsync({ id });
      await refresh();
      if (kind === "client" && routeId === id) openClient(null);
      toast.success(`${name} archived. Your logged time is kept.`, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await (kind === "client" ? unarchiveClient : unarchiveProject).mutateAsync({ id });
              await refresh();
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
      nav="clients"
      title="Clients"
      description={description}
      descriptionOnPhone
      actions={
        <div className="flex items-center gap-1">
          {all.length > 0 && (
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
      {clients.isLoading && <Skeleton className="h-64 w-full" />}
      {clients.error && <p className="text-destructive text-sm">Couldn't load clients: {clients.error.message}</p>}

      {clients.data && (
        <NewClientCard
          clientCount={all.length}
          open={newClientOpen}
          onOpenChange={setNewClientOpen}
          onCreated={(id) => openClient(id)}
        />
      )}

      {all.length > 0 && (
        <div
          data-headerless="the split view: the client list and the chosen client's profile, each with its own header"
          data-view={routeId ? "profile" : "list"}
          className="group/split grid overflow-clip rounded-xl border bg-card md:grid-cols-[17rem_minmax(0,1fr)]"
        >
          <div className="min-w-0 bg-muted/40 group-data-[view=profile]/split:max-md:hidden md:border-r">
            <ClientListPane
              toBill={groups.toBill.map((c) => item(c))}
              billed={groups.billed.map(({ client, quiet }) => item(client, quiet))}
              selectedId={selectedId}
              search={search}
              onSearch={setSearch}
              showSearch={all.length >= SEARCH_FROM}
              onOpen={openClient}
            />
          </div>
          <div className="flex min-w-0 flex-col group-data-[view=list]/split:max-md:hidden">
            {/* On a phone the profile is its own screen: the way back to the list is at its top. */}
            <Link
              href="/dashboard/clients"
              onClick={(e) => {
                e.preventDefault();
                openClient(null);
              }}
              className="flex min-h-11 items-center gap-1 px-3 pt-2 text-foreground/80 text-sm md:hidden"
            >
              <ChevronLeft className="size-4" aria-hidden /> All clients
            </Link>
            {selected ? (
              <ClientProfile
                key={selected.id}
                client={selected}
                allClients={clients.data}
                logos={logos}
                totals={totals.data}
                budgets={budgets.data}
                editing={editing}
                unbilled={unbilledOf(selected.id)}
                invoices={invoices.data ?? []}
                month={month}
                today={today}
                onArchiveClient={() => void archive({ kind: "client", id: selected.id, name: selected.name })}
                onArchiveProject={(p) => void archive({ kind: "project", ...p })}
              />
            ) : routeId ? (
              <div className="p-4">
                <Notice>
                  This client is not on your list. It may be archived (see{" "}
                  <Link href="/dashboard/clients/archived" className="underline underline-offset-4">
                    Archived clients and projects
                  </Link>
                  ) or removed.
                </Notice>
              </div>
            ) : (
              <Skeleton className="m-4 h-64" />
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}

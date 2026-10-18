"use client";

import { useEffect, useState } from "react";

import { Archive, Building2, ChevronDown, FolderKanban, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { LogoPicker } from "@/components/logo-picker";
import { PageHeader } from "@/components/page-header";
import { ProjectMark, useProjectLogos } from "@/components/project-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toISODate } from "@/lib/dates";
import { formatDuration } from "@/lib/duration";
import { fileToLogo } from "@/lib/logo";
import { trpc } from "@/lib/trpc";

import { SetupForm } from "../../today/_components/setup-form";

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#84cc16"];

/** Name, billing address and logo for one client — what its invoices' "bill to" block shows. */
function ClientDetailsForm({ id, onDone }: { id: string; onDone: () => void }) {
  const utils = trpc.useUtils();
  const client = trpc.clients.get.useQuery({ id });
  const update = trpc.clients.update.useMutation();
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => setLogo(client.data?.logo ?? null), [client.data?.logo]);

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setLogo(await fileToLogo(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't use that image.");
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await update.mutateAsync({
        id,
        name: String(fd.get("name")),
        legalName: String(fd.get("legalName") ?? ""),
        address: String(fd.get("address") ?? ""),
        email: String(fd.get("email") ?? "").trim(),
        rounding: {
          step: Number(fd.get("roundStep")),
          mode: fd.get("roundMode") === "nearest" ? "nearest" : "up",
          min: Number(fd.get("roundMin")),
        },
        logo,
      });
      await Promise.all([utils.clients.list.invalidate(), utils.clients.get.invalidate({ id })]);
      toast.success("Client updated.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update that client.");
    }
  }

  if (client.isLoading) return <Skeleton className="m-4 h-32" />;
  if (client.error || !client.data) {
    return <p className="px-4 py-3 text-destructive text-sm">Couldn't load client: {client.error?.message}</p>;
  }
  return (
    <form method="post" onSubmit={save} className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`cn-${id}`}>Client name</Label>
        <Input id={`cn-${id}`} name="name" defaultValue={client.data.name} required maxLength={80} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`cf-${id}`}>Full name (shown on invoices)</Label>
        <Input
          id={`cf-${id}`}
          name="legalName"
          defaultValue={client.data.legal_name ?? ""}
          placeholder={client.data.name}
          maxLength={150}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`ca-${id}`}>Billing address (shown on invoices)</Label>
        <Textarea
          id={`ca-${id}`}
          name="address"
          defaultValue={client.data.address ?? ""}
          rows={3}
          maxLength={300}
          placeholder={"500 Market St\nSan Francisco, CA 94105"}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`ce-${id}`}>Email (where you send invoices)</Label>
        <Input
          id={`ce-${id}`}
          name="email"
          type="email"
          defaultValue={client.data.email ?? ""}
          placeholder="accounts@client.com"
          maxLength={254}
          autoComplete="off"
        />
        <p className="text-muted-foreground text-xs">Kept private. Nothing is sent to it unless you send something.</p>
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="font-medium text-sm">Round the time on invoices</legend>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            name="roundStep"
            aria-label="Round to"
            defaultValue={client.data.round_step}
            className="h-9 rounded-lg border border-input bg-transparent px-2 dark:bg-input/30"
          >
            <option value={0}>Don't round</option>
            <option value={6}>Every 6 minutes (0.1 h)</option>
            <option value={15}>Every 15 minutes</option>
            <option value={30}>Every 30 minutes</option>
          </select>
          <select
            name="roundMode"
            aria-label="Round up or to the nearest"
            defaultValue={client.data.round_mode}
            className="h-9 rounded-lg border border-input bg-transparent px-2 dark:bg-input/30"
          >
            <option value="up">Round up</option>
            <option value="nearest">Round to the nearest</option>
          </select>
          <select
            name="roundMin"
            aria-label="Minimum per entry"
            defaultValue={client.data.round_min}
            className="h-9 rounded-lg border border-input bg-transparent px-2 dark:bg-input/30"
          >
            <option value={0}>No minimum</option>
            <option value={15}>At least 15 min per entry</option>
            <option value={30}>At least 30 min per entry</option>
            <option value={60}>At least 1 h per entry</option>
          </select>
        </div>
        <p className="text-muted-foreground text-xs">
          Applies when you make an invoice, entry by entry. Your logged time never changes, and the invoice says what
          was rounded.
        </p>
      </fieldset>
      <div className="grid gap-1.5">
        <Label>Logo</Label>
        <LogoPicker value={logo} onPick={pickLogo} onRemove={() => setLogo(null)} name="client logo" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={update.isPending}>
          Save client
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ClientsView() {
  const utils = trpc.useUtils();
  const clients = trpc.clients.list.useQuery();
  const createClient = trpc.clients.create.useMutation();
  const archiveClient = trpc.clients.archive.useMutation();
  const archiveProject = trpc.project.archive.useMutation();
  const [name, setName] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const logos = useProjectLogos();
  // undefined = leave the logo alone; null = remove; string = new logo (while a project is being edited).
  const [logoDraft, setLogoDraft] = useState<string | null | undefined>(undefined);
  const [showArchived, setShowArchived] = useState(false);

  // Month bounds come from the browser clock (the Worker runs in UTC).
  const [month] = useState(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toISODate(first), to: toISODate(last) };
  });
  const totals = trpc.project.totals.useQuery(month);
  const archived = trpc.project.listArchived.useQuery(undefined, { enabled: showArchived });
  const updateProject = trpc.project.update.useMutation();
  const unarchiveProject = trpc.project.unarchive.useMutation();

  async function saveProject(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const rate = Math.round(Number(fd.get("rate") || 0) * 100);
    try {
      await updateProject.mutateAsync({
        id,
        name: String(fd.get("name")),
        clientId: String(fd.get("clientId")),
        hourlyRate: Number.isFinite(rate) ? rate : 0,
        billable: fd.get("billable") === "on",
        logo: logoDraft,
      });
      await Promise.all([
        utils.clients.list.invalidate(),
        utils.entry.list.invalidate(),
        utils.project.logos.invalidate(),
      ]);
      setEditingId(null);
      setLogoDraft(undefined);
      toast.success("Project updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update that project.");
    }
  }

  async function pickProjectLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setLogoDraft(await fileToLogo(file, { maxW: 160, maxH: 160 }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't use that image.");
    }
  }

  async function restore(id: string) {
    try {
      await unarchiveProject.mutateAsync({ id });
      await Promise.all([utils.clients.list.invalidate(), utils.project.listArchived.invalidate()]);
      toast.success("Project restored.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't restore that project.");
    }
  }

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    try {
      const color = PALETTE[(clients.data?.length ?? 0) % PALETTE.length];
      await createClient.mutateAsync({ name, color });
      await utils.clients.list.invalidate();
      setName("");
      setNewOpen(false);
      toast.success("Client added. Add its projects below.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that client.");
    }
  }

  const unarchiveClient = trpc.clients.unarchive.useMutation();
  // Search: a client matches by its name (then all its projects show) or by any of its projects' names.
  const [search, setSearch] = useState("");
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const visibleClients = (clients.data ?? []).flatMap((c) => {
    if (words.length === 0) return [c];
    const clientHit = words.every((w) => c.name.toLowerCase().includes(w));
    const projects = clientHit
      ? c.projects
      : c.projects.filter((p) => words.every((w) => `${p.name} ${c.name}`.toLowerCase().includes(w)));
    return clientHit || projects.length > 0 ? [{ ...c, projects }] : [];
  });
  const archivedClients = trpc.clients.listArchived.useQuery(undefined, { enabled: showArchived });
  async function restoreClient(id: string) {
    try {
      await unarchiveClient.mutateAsync({ id });
      await Promise.all([utils.clients.list.invalidate(), utils.clients.listArchived.invalidate()]);
      toast.success("Client restored.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't restore that client.");
    }
  }
  const [confirming, setConfirming] = useState<{ kind: "client" | "project"; id: string; name: string } | null>(null);

  async function archive(kind: "client" | "project", id: string, name: string) {
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
              toast.error(err instanceof Error ? err.message : "Couldn't undo that.");
            }
          },
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't archive that.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive {confirming?.name}?</DialogTitle>
            <DialogDescription>
              {confirming?.kind === "client"
                ? "It disappears from the lists and the invoice builder. Your logged time and past invoices are kept, and importing time for it brings it back."
                : "It disappears from the project pickers. Your logged time and past invoices are kept, and you can restore it under Archived projects."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Keep it
            </Button>
            <Button onClick={() => confirming && archive(confirming.kind, confirming.id, confirming.name)}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The page's header card: what this page is, the button to add a client, and the numbers at a glance. */}
      <PageHeader
        title="Projects & Clients"
        description="Your clients, and the projects you do for each. Hourly rates live here."
        actions={
          <Button type="button" size="lg" className="h-10" onClick={() => setNewOpen(true)}>
            <Plus /> New client
          </Button>
        }
      >
        {(clients.data?.length ?? 0) > 0 && (
          <>
            {(clients.data?.length ?? 0) > 0 && (
              <dl className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                  <dt className="text-muted-foreground text-xs">Clients</dt>
                  <dd className="font-mono font-semibold text-base tabular-nums sm:text-xl">{clients.data?.length}</dd>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                  <dt className="text-muted-foreground text-xs">Projects</dt>
                  <dd className="font-mono font-semibold text-base tabular-nums sm:text-xl">
                    {(clients.data ?? []).reduce((a, c) => a + c.projects.length, 0)}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                  <dt className="text-muted-foreground text-xs">Logged this month</dt>
                  <dd className="font-mono font-semibold text-base tabular-nums sm:text-xl">
                    {formatDuration(Object.values(totals.data ?? {}).reduce((a, t) => a + t.range, 0))}
                  </dd>
                </div>
              </dl>
            )}
            {(clients.data?.length ?? 0) > 0 && (
              <search aria-label="Find clients and projects" className="relative block">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search clients and projects…"
                  aria-label="Search clients and projects"
                  className="h-11 pl-9 text-base"
                />
              </search>
            )}
          </>
        )}
      </PageHeader>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New client</DialogTitle>
            <DialogDescription>The company or person you do the work for. Add projects to it next.</DialogDescription>
          </DialogHeader>
          <form method="post" onSubmit={addClient} className="flex flex-col gap-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="New client name"
              placeholder="Client name"
              required
              maxLength={80}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createClient.isPending}>
                Add client
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {clients.isLoading && <Skeleton className="h-32 w-full" />}
      {clients.error && <p className="text-destructive text-sm">Couldn't load clients: {clients.error.message}</p>}

      {words.length > 0 && visibleClients.length === 0 && (
        <p className="py-6 text-center text-muted-foreground text-sm">No client or project matches that.</p>
      )}

      {visibleClients.map((c) => (
        <section
          key={c.id}
          className="overflow-hidden rounded-xl border border-l-4 bg-card"
          style={{ borderLeftColor: c.color }}
        >
          <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b bg-muted/40 px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1 font-semibold text-foreground/70 text-xs uppercase tracking-wider">
                <Building2 className="size-3.5" aria-hidden /> Client
              </p>
              <h2 className="truncate font-semibold text-lg">{c.name}</h2>
              <p className="text-foreground/70 text-sm">
                {c.projects.length} project{c.projects.length === 1 ? "" : "s"}
              </p>
            </div>
            <span className="flex max-sm:-ml-2.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingClientId(editingClientId === c.id ? null : c.id)}
                aria-label={`Edit ${c.name} billing details`}
              >
                <Pencil /> Billing details
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming({ kind: "client", id: c.id, name: c.name })}
              >
                <Archive /> Archive
              </Button>
            </span>
          </header>
          {editingClientId === c.id && <ClientDetailsForm id={c.id} onDone={() => setEditingClientId(null)} />}
          <div className={`bg-muted/20 px-4 pt-3 pb-4 ${editingClientId === c.id ? "border-t" : ""}`}>
            <p className="mb-2 flex items-center gap-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
              <FolderKanban className="size-3.5" aria-hidden /> Projects
            </p>
            <ul className="flex flex-col gap-2">
              {c.projects.map((p) =>
                editingId === p.id ? (
                  <li key={p.id} className="rounded-lg border border-foreground/15 bg-card px-3 py-3">
                    <form
                      method="post"
                      onSubmit={(e) => saveProject(e, p.id)}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Input name="name" defaultValue={p.name} required className="w-44" autoFocus />
                      <select
                        name="clientId"
                        defaultValue={p.client_id}
                        aria-label="Client"
                        className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                      >
                        {clients.data?.map((cl) => (
                          <option key={cl.id} value={cl.id}>
                            {cl.name}
                          </option>
                        ))}
                      </select>
                      <span className="flex items-center gap-1 text-muted-foreground text-sm">
                        $
                        <Input
                          name="rate"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={(p.hourly_rate / 100).toFixed(2)}
                          className="w-24"
                          aria-label="Rate per hour"
                        />
                        /h
                      </span>
                      <label className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="billable" defaultChecked={p.billable} /> Billable
                      </label>
                      <LogoPicker
                        compact
                        value={logoDraft === undefined ? logos[p.id] : logoDraft}
                        onPick={pickProjectLogo}
                        onRemove={() => setLogoDraft(null)}
                        name="project logo"
                      />
                      <Button type="submit" size="sm" disabled={updateProject.isPending}>
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          setLogoDraft(undefined);
                        }}
                      >
                        Cancel
                      </Button>
                    </form>
                  </li>
                ) : (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-foreground/15 bg-card px-3 py-2 text-sm"
                  >
                    <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 sm:flex-1">
                      <ProjectMark projectId={p.id} color={c.color} logos={logos} />
                      <span className="font-medium">{p.name}</span>
                      {p.hourly_rate > 0 ? (
                        <span className="text-foreground/70">${(p.hourly_rate / 100).toFixed(2)}/h</span>
                      ) : (
                        p.billable && (
                          <span className="text-destructive text-xs" title="Use the pencil to set an hourly rate">
                            No hourly rate yet
                          </span>
                        )
                      )}
                      {!p.billable && <span className="text-foreground/70 text-xs">non-billable</span>}
                    </span>
                    <span className="flex items-center gap-3 font-mono text-[13px] text-foreground/75 tabular-nums sm:ml-auto">
                      <span title="This month">{formatDuration(totals.data?.[p.id]?.range ?? 0)} mo</span>
                      <span title="All time">{formatDuration(totals.data?.[p.id]?.total ?? 0)} total</span>
                    </span>
                    <span className="flex max-sm:ml-auto">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setLogoDraft(undefined);
                          setEditingId(p.id);
                        }}
                        aria-label={`Edit ${p.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setConfirming({ kind: "project", id: p.id, name: p.name })}
                        aria-label={`Archive ${p.name}`}
                      >
                        <Archive />
                      </Button>
                    </span>
                  </li>
                ),
              )}
            </ul>
            <div className="mt-3 rounded-lg border border-foreground/15 bg-card p-3">
              <p className="mb-2 flex items-center gap-1.5 font-semibold text-sm">
                <Plus className="size-4 text-primary" aria-hidden /> Add a project for {c.name}
              </p>
              <SetupForm clientId={c.id} />
            </div>
          </div>
        </section>
      ))}

      {clients.data?.length === 0 && (
        <p className="py-10 text-center text-muted-foreground text-sm">No clients yet. Use New client above.</p>
      )}
      <div>
        <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
          <ChevronDown className={showArchived ? "rotate-180" : ""} /> Archived clients and projects
        </Button>
        {showArchived && (
          <ul className="mt-2 divide-y rounded-xl border bg-card">
            {archived.isLoading && <li className="p-3 text-muted-foreground text-sm">Loading…</li>}
            {archived.error && (
              <li className="p-3 text-destructive text-sm">Couldn't load: {archived.error.message}</li>
            )}
            {archived.data?.length === 0 && archivedClients.data?.length === 0 && (
              <li className="p-3 text-muted-foreground text-sm">Nothing archived.</li>
            )}
            {archivedClients.data?.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  {c.name} <span className="text-muted-foreground">· client</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => restoreClient(c.id)}>
                  <RotateCcw /> Restore
                </Button>
              </li>
            ))}
            {archived.data?.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  {p.name} <span className="text-muted-foreground">· {p.client.name}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => restore(p.id)}>
                  <RotateCcw /> Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

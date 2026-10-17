"use client";

import { useEffect, useState } from "react";

import { Archive, ChevronDown, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { LogoPicker } from "@/components/logo-picker";
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that client.");
    }
  }

  const unarchiveClient = trpc.clients.unarchive.useMutation();
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
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

      <div>
        <h1 className="font-semibold text-xl">My work</h1>
        <p className="text-muted-foreground text-sm">
          Your clients, and the projects you do for each. Hourly rates live here.
        </p>
      </div>

      <form method="post" onSubmit={addClient} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New client name"
          placeholder="New client name"
          required
          className="min-w-0 flex-1 sm:max-w-xs sm:flex-none"
        />
        <Button type="submit" disabled={createClient.isPending}>
          Add client
        </Button>
      </form>

      {clients.isLoading && <Skeleton className="h-32 w-full" />}
      {clients.error && <p className="text-destructive text-sm">Couldn't load clients: {clients.error.message}</p>}

      {clients.data?.map((c) => (
        <section key={c.id} className="rounded-xl border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b px-4 py-3">
            <h2 className="flex min-w-0 items-center gap-2 font-medium">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </h2>
            <span className="flex">
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
          <ul className="divide-y">
            {c.projects.map((p) =>
              editingId === p.id ? (
                <li key={p.id} className="px-4 py-3">
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
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-sm"
                >
                  <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 sm:flex-1">
                    <ProjectMark projectId={p.id} color={c.color} logos={logos} />
                    {p.name}
                    {p.hourly_rate > 0 ? (
                      <span className="text-muted-foreground">${(p.hourly_rate / 100).toFixed(2)}/h</span>
                    ) : (
                      p.billable && (
                        <span className="text-destructive text-xs" title="Use the pencil to set an hourly rate">
                          No hourly rate yet
                        </span>
                      )
                    )}
                    {!p.billable && <span className="text-muted-foreground text-xs">non-billable</span>}
                  </span>
                  <span className="flex items-center gap-3 font-mono text-muted-foreground text-xs tabular-nums sm:ml-auto">
                    <span title="This month">{formatDuration(totals.data?.[p.id]?.range ?? 0)} mo</span>
                    <span title="All time">{formatDuration(totals.data?.[p.id]?.total ?? 0)} total</span>
                  </span>
                  <span className="flex">
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
          <div className="border-t p-3">
            <SetupForm clientId={c.id} />
          </div>
        </section>
      ))}

      {clients.data?.length === 0 && (
        <p className="py-10 text-center text-muted-foreground text-sm">No clients yet. Add one above.</p>
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

"use client";

import { useState } from "react";

import { ChevronDown, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** The collapsed "Archived clients and projects" list; it only fetches once opened. */
export function ArchivedSection() {
  const utils = trpc.useUtils();
  const [showArchived, setShowArchived] = useState(false);
  const archived = trpc.project.listArchived.useQuery(undefined, { enabled: showArchived });
  const archivedClients = trpc.clients.listArchived.useQuery(undefined, { enabled: showArchived });
  const unarchiveProject = trpc.project.unarchive.useMutation();
  const unarchiveClient = trpc.clients.unarchive.useMutation();

  async function restore(id: string) {
    try {
      await unarchiveProject.mutateAsync({ id });
      await Promise.all([utils.clients.list.invalidate(), utils.project.listArchived.invalidate()]);
      toast.success("Project restored.");
    } catch (err) {
      toastError(err, "Couldn't restore that project.");
    }
  }

  async function restoreClient(id: string) {
    try {
      await unarchiveClient.mutateAsync({ id });
      await Promise.all([utils.clients.list.invalidate(), utils.clients.listArchived.invalidate()]);
      toast.success("Client restored.");
    } catch (err) {
      toastError(err, "Couldn't restore that client.");
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
        <ChevronDown className={showArchived ? "rotate-180" : ""} /> Archived clients and projects
      </Button>
      {showArchived && (
        <ul className="mt-2 flex flex-col gap-2">
          {archived.isLoading && <li className="text-muted-foreground text-sm">Loading…</li>}
          {archived.error && <li className="text-destructive text-sm">Couldn't load: {archived.error.message}</li>}
          {archived.data?.length === 0 && archivedClients.data?.length === 0 && (
            <li className="text-muted-foreground text-sm">Nothing archived.</li>
          )}
          {archivedClients.data?.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-xl border bg-card px-4 py-2 text-sm">
              <span>
                {c.name} <span className="text-muted-foreground">· client</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => restoreClient(c.id)}>
                <RotateCcw /> Restore
              </Button>
            </li>
          ))}
          {archived.data?.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border bg-card px-4 py-2 text-sm">
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
  );
}

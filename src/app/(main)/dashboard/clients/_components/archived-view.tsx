"use client";

import Link from "next/link";

import { ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { HeaderCard } from "@/components/header-card";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/**
 * Archived clients and projects, on a page of their own (a "···" menu in the Clients header opens it). Restoring brings one
 * back to the Clients page with all its logged time.
 */
export function ArchivedView() {
  const utils = trpc.useUtils();
  const projects = trpc.project.listArchived.useQuery();
  const clients = trpc.clients.listArchived.useQuery();
  const unarchiveProject = trpc.project.unarchive.useMutation();
  const unarchiveClient = trpc.clients.unarchive.useMutation();

  async function restoreProject(id: string) {
    try {
      await unarchiveProject.mutateAsync({ id });
      await Promise.all([
        utils.clients.list.invalidate(),
        utils.project.listArchived.invalidate(),
        utils.clients.listArchived.invalidate(),
      ]);
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

  const loading = projects.isLoading || clients.isLoading;
  const error = projects.error ?? clients.error;
  const empty = (projects.data?.length ?? 0) === 0 && (clients.data?.length ?? 0) === 0;

  return (
    <PageShell
      nav="clients"
      title="Archived"
      description="Clients and projects you archived. Restore one and it comes back with all its time."
      descriptionOnPhone
      actions={
        <Button asChild variant="outline" className="h-10">
          <Link href="/dashboard/clients">
            <ArrowLeft /> Clients
          </Link>
        </Button>
      }
    >
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <p className="text-destructive text-sm">Couldn't load: {error.message}</p>
      ) : empty ? (
        <p className="py-6 text-center text-muted-foreground text-sm">Nothing archived.</p>
      ) : (
        <HeaderCard
          label="Archived"
          header={
            <h2 className="font-semibold text-base">
              Archived{" "}
              <span className="font-normal text-foreground/75 text-sm">
                ({(clients.data?.length ?? 0) + (projects.data?.length ?? 0)})
              </span>
            </h2>
          }
        >
          <ul className="-mx-3 sm:-mx-4">
            {clients.data?.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 border-t px-3 py-2.5 text-sm first:border-t-0 sm:px-4"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{c.name}</span> <span className="text-muted-foreground">· client</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => restoreClient(c.id)}>
                  <RotateCcw /> Restore
                </Button>
              </li>
            ))}
            {projects.data?.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 border-t px-3 py-2.5 text-sm first:border-t-0 sm:px-4"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{p.name}</span>{" "}
                  <span className="text-muted-foreground">· {p.client.name}</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => restoreProject(p.id)}>
                  <RotateCcw /> Restore
                </Button>
              </li>
            ))}
          </ul>
        </HeaderCard>
      )}
    </PageShell>
  );
}

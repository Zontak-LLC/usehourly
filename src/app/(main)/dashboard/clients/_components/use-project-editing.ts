"use client";

import { useState } from "react";

import { toast } from "sonner";

import { fileToLogo } from "@/lib/logo";
import { trpc } from "@/lib/trpc";

/** Which project is being edited (one at a time across all clients), its logo draft, and the save. */
export function useProjectEditing() {
  const utils = trpc.useUtils();
  const updateProject = trpc.project.update.useMutation();
  const [editingId, setEditingId] = useState<string | null>(null);
  // undefined = leave the logo alone; null = remove; string = new logo (while a project is being edited).
  const [logoDraft, setLogoDraft] = useState<string | null | undefined>(undefined);

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

  function startEditing(id: string) {
    setLogoDraft(undefined);
    setEditingId(id);
  }

  function stopEditing() {
    setEditingId(null);
    setLogoDraft(undefined);
  }

  return {
    editingId,
    logoDraft,
    isSaving: updateProject.isPending,
    saveProject,
    pickProjectLogo,
    removeLogoDraft: () => setLogoDraft(null),
    startEditing,
    stopEditing,
  };
}

export type ProjectEditing = ReturnType<typeof useProjectEditing>;

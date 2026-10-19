"use client";

import { useState } from "react";

import { toast } from "sonner";

import { parseBudgetInput } from "@/lib/budget";
import { fileToLogo } from "@/lib/logo";
import { toastError } from "@/lib/toast-error";
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
    const unit = fd.get("budgetUnit") === "hours" ? "hours" : "dollars";
    const budgetAmount = parseBudgetInput(String(fd.get("budgetAmount") ?? ""), unit);
    if (budgetAmount === undefined) {
      return toast.error("Couldn't read that budget. Try 1000 for dollars or 22.5 for hours, or leave it blank.");
    }
    try {
      await updateProject.mutateAsync({
        id,
        name: String(fd.get("name")),
        clientId: String(fd.get("clientId")),
        hourlyRate: Number.isFinite(rate) ? rate : 0,
        billable: fd.get("billable") === "on",
        budgetAmount,
        budgetUnit: unit,
        budgetPeriod: fd.get("budgetPeriod") === "total" ? "total" : "month",
        logo: logoDraft,
      });
      await Promise.all([
        utils.clients.list.invalidate(),
        utils.entry.list.invalidate(),
        utils.project.budgets.invalidate(),
        utils.project.logos.invalidate(),
      ]);
      setEditingId(null);
      setLogoDraft(undefined);
      toast.success("Project updated.");
    } catch (err) {
      toastError(err, "Couldn't update that project.");
    }
  }

  async function pickProjectLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setLogoDraft(await fileToLogo(file, { maxW: 160, maxH: 160 }));
    } catch (err) {
      toastError(err, "Couldn't use that image.");
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

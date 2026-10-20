"use client";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { fileToAvatar } from "@/lib/logo";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/**
 * Saving and removing the person's picture, shared by the top-bar menu and the Account page, so both do exactly the
 * same thing: the file is cropped to a small square in the browser, saved on the account, and the page is refreshed so
 * the top bar (read on the server) shows it at once.
 */
export function useAvatarUpload() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const setAvatar = trpc.account.setAvatar.useMutation();

  async function save(avatar: string | null) {
    try {
      await setAvatar.mutateAsync({ avatar });
      await utils.account.me.invalidate();
      router.refresh();
      toast.success(avatar ? "Picture saved." : "Picture removed.");
    } catch (err) {
      toastError(err, "Couldn't save that picture.");
    }
  }

  /** For a file input's onChange: clears the input, then crops and saves the chosen image. */
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await save(await fileToAvatar(file));
    } catch (err) {
      toastError(err, "Couldn't use that image.");
    }
  }

  return { pick, remove: () => save(null), busy: setAvatar.isPending };
}

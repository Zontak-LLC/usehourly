"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import type { CropRequest } from "@/components/avatar-cropper";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/**
 * Saving and removing the person's picture, shared by the top-bar menu and the Account page, so both do exactly the
 * same thing: the chosen file opens in the position editor (`crop`, shown by `AvatarCropper`), the person moves and
 * zooms it, the finished small square is saved on the account, and the page is refreshed so the top bar (read on the
 * server) shows it at once.
 */
export function useAvatarUpload() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const setAvatar = trpc.account.setAvatar.useMutation();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);

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

  /** For a file input's onChange: clears the input and opens the chosen image in the position editor. */
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toastError(new Error("Choose an image file (PNG or JPEG)."), "");
    setSrc(URL.createObjectURL(file));
  }

  const crop: CropRequest | null = src
    ? {
        src,
        busy: setAvatar.isPending,
        onCancel: () => setSrc(null),
        onSave: async (dataUrl) => {
          await save(dataUrl);
          setSrc(null);
        },
      }
    : null;

  return { pick, crop, remove: () => save(null), busy: setAvatar.isPending };
}

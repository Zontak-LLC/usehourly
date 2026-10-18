"use client";

import { useRef } from "react";

import { ImagePlus } from "lucide-react";
import { toast } from "sonner";

import { fileToLogo } from "@/lib/logo";
import { trpc } from "@/lib/trpc";

/** {clientId: logo data URL}. One shared, cached query, like the project logos: logos never ride along with lists. */
export function useClientLogos() {
  return trpc.clients.logos.useQuery(undefined, { staleTime: 5 * 60_000 }).data ?? {};
}

/**
 * The square before a client's name: its logo, or a dashed "Logo" square. Either one opens the file picker, so a
 * logo can be added or replaced right from the card (removing it, and everything else about billing, is under
 * "Billing details"). The same logo is printed on that client's invoices.
 */
export function ClientLogoSlot({ clientId, name }: { clientId: string; name: string }) {
  const utils = trpc.useUtils();
  const logos = useClientLogos();
  const setLogo = trpc.clients.setLogo.useMutation();
  const input = useRef<HTMLInputElement>(null);
  const logo = logos[clientId];

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // choosing the same file again must still fire
    if (!file) return;
    try {
      await setLogo.mutateAsync({ id: clientId, logo: await fileToLogo(file) });
      await Promise.all([utils.clients.logos.invalidate(), utils.clients.get.invalidate({ id: clientId })]);
      toast.success(`Logo saved for ${name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that logo.");
    }
  }

  return (
    <>
      <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={pick} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={setLogo.isPending}
        aria-label={logo ? `Change the logo for ${name}` : `Add a logo for ${name}`}
        title={logo ? "Change logo" : "Add a logo"}
        className={`flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border disabled:opacity-60 ${
          logo ? "bg-white" : "border-dashed bg-card hover:bg-muted"
        }`}
      >
        {logo ? (
          // biome-ignore lint/performance/noImgElement: a small data: URL, nothing to optimize
          <img src={logo} alt="" className="size-full object-contain p-1" />
        ) : (
          <span className="flex flex-col items-center text-muted-foreground text-xs">
            <ImagePlus className="size-4" aria-hidden />
            Logo
          </span>
        )}
      </button>
    </>
  );
}

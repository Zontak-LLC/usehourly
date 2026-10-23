"use client";

import { KeyRound, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type Token = {
  id: string;
  name: string;
  prefix: string;
  access: string;
  state: string;
  last_used_at: number | null;
  expires_at: number | null;
};

function when(epoch: number | null): string {
  return epoch
    ? new Date(epoch * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "never";
}

/**
 * One access token as a row: a key icon, its name and fingerprint, what it may do, when it was last used, and Delete.
 * Deleting an active token asks once in the row (anything using it stops working); a revoked or expired one goes at once.
 */
export function TokenRow({
  token: t,
  confirming,
  busy,
  onAsk,
  onCancel,
  onDelete,
}: {
  token: Token;
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const live = t.state === "active";
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <span
        aria-hidden
        className={`grid size-10 shrink-0 place-items-center rounded-full ${live ? "bg-muted text-success" : "bg-muted text-foreground/50"}`}
      >
        <KeyRound className="size-5" />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold font-display text-base">{t.name}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs">{t.prefix}…</span>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest ${
              live ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive"
            }`}
          >
            {live ? "Active" : t.state === "revoked" ? "Revoked" : "Expired"}
          </span>
          <span className="text-muted-foreground text-xs">{t.access === "read" ? "Read only" : "Read and change"}</span>
        </div>
        <span className="text-muted-foreground text-xs">
          Last used {when(t.last_used_at)} · {t.expires_at ? `expires ${when(t.expires_at)}` : "never expires"}
        </span>
      </div>
      {confirming ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <span className="text-sm">Anything using it stops working right away.</span>
          <Button size="sm" variant="destructive" disabled={busy} onClick={onDelete}>
            Yes, delete
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            Keep it
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          aria-label={`Delete ${t.name}`}
          onClick={live ? onAsk : onDelete}
        >
          <Trash2 aria-hidden /> Delete
        </Button>
      )}
    </li>
  );
}

"use client";

import { KeyRound } from "lucide-react";

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

/** One access token as a row: a key icon, its name and fingerprint, what it may do, when it was last used, and Revoke. */
export function TokenRow({
  token: t,
  confirming,
  busy,
  onAsk,
  onCancel,
  onRevoke,
}: {
  token: Token;
  confirming: boolean;
  busy: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onRevoke: () => void;
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
      {live &&
        (confirming ? (
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={busy} onClick={onRevoke}>
              Yes, revoke
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={onAsk}>
            Revoke
          </Button>
        ))}
    </li>
  );
}

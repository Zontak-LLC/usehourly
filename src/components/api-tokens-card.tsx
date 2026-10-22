"use client";

import { useState } from "react";

import { toast } from "sonner";

import { ConnectSnippets } from "@/components/connect-snippets";
import { CopyBox } from "@/components/copy-box";
import { SectionCard } from "@/components/section-card";
import { TokenRow } from "@/components/token-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { EXPIRY_CHOICES, type ExpiryKey, type TokenAccess } from "@/lib/api-token";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** Make, copy and revoke the personal access tokens that let an AI assistant use /api/mcp. */
export function ApiTokensCard() {
  const utils = trpc.useUtils();
  const tokens = trpc.account.listApiTokens.useQuery();
  const create = trpc.account.createApiToken.useMutation();
  const revoke = trpc.account.revokeApiToken.useMutation();
  const [name, setName] = useState("");
  const [access, setAccess] = useState<TokenAccess>("write");
  const [expires, setExpires] = useState<ExpiryKey>("90d");
  const [fresh, setFresh] = useState<{ token: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const endpoint = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;

  async function make(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const made = await create.mutateAsync({ name, access, expires });
      setFresh({ token: made.token, name: made.name });
      setName("");
      await utils.account.listApiTokens.invalidate();
    } catch (err) {
      toastError(err, "Couldn't make the token.");
    }
  }

  async function stop(id: string) {
    try {
      await revoke.mutateAsync({ id });
      setConfirming(null);
      await utils.account.listApiTokens.invalidate();
      toast.success("Token revoked. It stops working right away.");
    } catch (err) {
      toastError(err, "Couldn't revoke the token.");
    }
  }

  return (
    <SectionCard
      title="Access tokens"
      description="An assistant connects with a personal access token. Choose whether it can only read your data or also make changes, and revoke a token whenever you like."
    >
      <form method="post" onSubmit={make} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="token-name">Name</Label>
          <Input
            id="token-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Claude Code on my laptop"
            maxLength={60}
            required
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid w-full gap-1.5 sm:w-52">
            <Label htmlFor="token-access">Access</Label>
            <NativeSelect id="token-access" value={access} onChange={(e) => setAccess(e.target.value as TokenAccess)}>
              <option value="write">Read and change</option>
              <option value="read">Read only</option>
            </NativeSelect>
          </div>
          <div className="grid w-32 gap-1.5">
            <Label htmlFor="token-expires">Expires</Label>
            <NativeSelect id="token-expires" value={expires} onChange={(e) => setExpires(e.target.value as ExpiryKey)}>
              {EXPIRY_CHOICES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" disabled={create.isPending}>
            Make token
          </Button>
        </div>
      </form>

      {fresh && (
        <div className="grid gap-4 rounded-2xl bg-amber/10 p-4 ring-2 ring-amber/60">
          <p className="font-semibold text-sm">
            Copy your new token now. For safety it is shown only once, and UseHourly keeps just a fingerprint of it.
          </p>
          <CopyBox label={`Token "${fresh.name}"`} text={fresh.token} />
          <ConnectSnippets endpoint={endpoint} token={fresh.token} />
          <Button type="button" variant="outline" className="self-start" onClick={() => setFresh(null)}>
            I've saved it
          </Button>
        </div>
      )}

      {tokens.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {tokens.data?.length === 0 && <p className="text-muted-foreground text-sm">No tokens yet.</p>}
      {(tokens.data?.length ?? 0) > 0 && (
        <ul className="divide-y divide-foreground/10 overflow-hidden rounded-2xl ring-1 ring-foreground/10">
          {tokens.data?.map((t) => (
            <TokenRow
              key={t.id}
              token={t}
              confirming={confirming === t.id}
              busy={revoke.isPending}
              onAsk={() => setConfirming(t.id)}
              onCancel={() => setConfirming(null)}
              onRevoke={() => stop(t.id)}
            />
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-xs">
        Server address: <span className="font-mono">{endpoint}</span>. An assistant can see and change only your own
        data. It can't change your password or make more tokens.
      </p>
    </SectionCard>
  );
}

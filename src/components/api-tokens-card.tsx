"use client";

import { useState } from "react";

import { toast } from "sonner";

import { ConnectSnippets } from "@/components/connect-snippets";
import { CopyBox } from "@/components/copy-box";
import { Pagination } from "@/components/pagination";
import { SectionCard } from "@/components/section-card";
import { TokenForm } from "@/components/token-form";
import { TokenRow } from "@/components/token-row";
import { Button } from "@/components/ui/button";
import { usePageSize } from "@/components/use-page-size";
import type { ExpiryKey, TokenAccess } from "@/lib/api-token";
import { paginate } from "@/lib/paginate";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** Make, copy and revoke the personal access tokens that let an AI assistant use /api/mcp. */
export function ApiTokensCard() {
  const utils = trpc.useUtils();
  const tokens = trpc.account.listApiTokens.useQuery();
  const create = trpc.account.createApiToken.useMutation();
  const revoke = trpc.account.revokeApiToken.useMutation();
  const [fresh, setFresh] = useState<{ token: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // A long list is paged like the invoices: 3 to a page on a phone, 10 on a wide screen.
  const [pageNo, setPageNo] = useState(1);
  const pageSize = usePageSize();
  const page = paginate(tokens.data ?? [], pageNo, pageSize);

  const endpoint = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;

  async function make(v: { name: string; access: TokenAccess; expires: ExpiryKey }) {
    try {
      const made = await create.mutateAsync(v);
      setFresh({ token: made.token, name: made.name });
      await utils.account.listApiTokens.invalidate();
      return true;
    } catch (err) {
      toastError(err, "Couldn't make the token.");
      return false;
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
      title="API tokens"
      description="An API token (also called an API key or access token) lets an app or a script sign in as you. Make one, copy it once, and revoke it whenever you like."
    >
      <TokenForm busy={create.isPending} onMake={make} />

      {fresh && (
        <div className="grid gap-4 rounded-2xl bg-card p-4 ring-2 ring-success/50">
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
          {page.items.map((t) => (
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
      <Pagination page={page} noun="tokens" onPage={setPageNo} />

      <p className="text-muted-foreground text-xs">
        Server address: <span className="font-mono">{endpoint}</span>. An assistant can see and change only your own
        data. It can't change your password or make more tokens.
      </p>
    </SectionCard>
  );
}

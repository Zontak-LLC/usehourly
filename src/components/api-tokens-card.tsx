"use client";

import { useState } from "react";

import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPIRY_CHOICES, type ExpiryKey, type TokenAccess } from "@/lib/api-token";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function when(epoch: number | null): string {
  return epoch
    ? new Date(epoch * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "never";
}

function CopyBox({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">{label}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error("Couldn't copy. Select the text and copy it by hand.");
            }
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-3 font-mono text-xs">
        {text}
      </pre>
    </div>
  );
}

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
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="token-access">Access</Label>
            <select
              id="token-access"
              className={selectClass}
              value={access}
              onChange={(e) => setAccess(e.target.value as TokenAccess)}
            >
              <option value="write">Read and change</option>
              <option value="read">Read only</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="token-expires">Expires</Label>
            <select
              id="token-expires"
              className={selectClass}
              value={expires}
              onChange={(e) => setExpires(e.target.value as ExpiryKey)}
            >
              {EXPIRY_CHOICES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={create.isPending}>
            Make token
          </Button>
        </div>
      </form>

      {fresh && (
        <div className="grid gap-3 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3">
          <p className="font-medium text-sm">
            Copy your new token now. For safety it is shown only once, and UseHourly keeps just a fingerprint of it.
          </p>
          <CopyBox label={`Token "${fresh.name}"`} text={fresh.token} />
          <CopyBox
            label="Add it to Claude Code"
            text={`claude mcp add --transport http usehourly ${endpoint} --header "Authorization: Bearer ${fresh.token}"`}
          />
          <CopyBox
            label="Cursor: put in ~/.cursor/mcp.json"
            text={JSON.stringify(
              { mcpServers: { usehourly: { url: endpoint, headers: { Authorization: `Bearer ${fresh.token}` } } } },
              null,
              2,
            )}
          />
          <CopyBox
            label="VS Code: put in .vscode/mcp.json"
            text={JSON.stringify(
              {
                servers: {
                  usehourly: { type: "http", url: endpoint, headers: { Authorization: `Bearer ${fresh.token}` } },
                },
              },
              null,
              2,
            )}
          />
          <CopyBox
            label="Any other MCP client that reads a JSON config"
            text={JSON.stringify(
              {
                mcpServers: {
                  usehourly: { type: "http", url: endpoint, headers: { Authorization: `Bearer ${fresh.token}` } },
                },
              },
              null,
              2,
            )}
          />
          <Button type="button" variant="outline" className="self-start" onClick={() => setFresh(null)}>
            I've saved it
          </Button>
        </div>
      )}

      <div className="grid gap-2">
        {tokens.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {tokens.data?.length === 0 && <p className="text-muted-foreground text-sm">No tokens yet.</p>}
        {tokens.data?.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
            <div className="grid gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{t.prefix}…</span>
                <span className="text-muted-foreground text-xs">
                  {t.access === "read" ? "Read only" : "Read and change"}
                </span>
                {t.state !== "active" && (
                  <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive text-xs">
                    {t.state === "revoked" ? "Revoked" : "Expired"}
                  </span>
                )}
              </div>
              <span className="text-muted-foreground text-xs">
                Last used {when(t.last_used_at)} · {t.expires_at ? `expires ${when(t.expires_at)}` : "never expires"}
              </span>
            </div>
            {t.state === "active" &&
              (confirming === t.id ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={revoke.isPending} onClick={() => stop(t.id)}>
                    Yes, revoke
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>
                    Keep it
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirming(t.id)}>
                  Revoke
                </Button>
              ))}
          </div>
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        Server address: <span className="font-mono">{endpoint}</span>. An assistant can see and change only your own
        data. It can't change your password or make more tokens.
      </p>
    </SectionCard>
  );
}

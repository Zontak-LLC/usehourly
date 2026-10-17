"use client";

import { useState } from "react";

import { Check, Copy, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { checkRange, describeRange } from "@/lib/export-range";
import { DEFAULT_SHARE_EXPIRY_DAYS, SHARE_EXPIRY_DAYS, type ShareStatus } from "@/lib/timesheet-share";
import { trpc } from "@/lib/trpc";

const STATUS_LABEL: Record<ShareStatus, string> = {
  waiting: "Waiting for approval",
  approved: "Approved",
  revoked: "Turned off",
  expired: "Expired",
};

/**
 * "Share for sign-off": freezes the hours of a range into a private link the client can open without an account,
 * check, print and approve. Lives next to the export buttons on Week and Month and starts on what the screen shows.
 */
export function ShareTimesheet({
  defaultFrom,
  defaultTo,
  projectId: initialProject = "",
}: {
  defaultFrom: string;
  defaultTo: string;
  projectId?: string;
}) {
  const utils = trpc.useUtils();
  const clients = trpc.clients.list.useQuery();
  const create = trpc.timesheetShare.create.useMutation();
  const revoke = trpc.timesheetShare.revoke.useMutation();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  // "" = everything, "c:<id>" = one client, "p:<id>" = one project
  const [scope, setScope] = useState(initialProject ? `p:${initialProject}` : "");
  const [includeNotes, setIncludeNotes] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState<number>(DEFAULT_SHARE_EXPIRY_DAYS);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const shares = trpc.timesheetShare.list.useQuery(undefined, { enabled: open });

  const check = checkRange(from, to);

  function onOpenChange(next: boolean) {
    if (next) {
      setFrom(defaultFrom);
      setTo(defaultTo);
      setScope(initialProject ? `p:${initialProject}` : "");
      setLink(null);
      setCopied(false);
    }
    setOpen(next);
  }

  async function make() {
    if (!check.ok) return;
    try {
      const out = await create.mutateAsync({
        from,
        to,
        includeNotes,
        expiresInDays,
        ...(scope.startsWith("c:") ? { clientId: scope.slice(2) } : {}),
        ...(scope.startsWith("p:") ? { projectId: scope.slice(2) } : {}),
      });
      setLink(`${window.location.origin}/timesheet/${out.token}`);
      setCopied(false);
      await utils.timesheetShare.list.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't make the link.");
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      toast.info("Select the link and copy it by hand.");
    }
  }

  async function turnOff(id: string) {
    try {
      await revoke.mutateAsync({ id });
      await utils.timesheetShare.list.invalidate();
      toast.success("That link is turned off.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't turn it off.");
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Send /> Share for sign-off
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-[80vh] w-96 max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto"
      >
        <div>
          <p className="font-medium">Send hours to a client</p>
          <p className="text-muted-foreground text-sm">
            Makes a private link to a frozen copy of these hours (no rates or money). Your client can print it and
            approve it.
          </p>
        </div>

        {link ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
            <p className="font-medium text-sm">Your link is ready. Copy it now: it is shown only once.</p>
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Timesheet link" />
            <div className="flex gap-2">
              <Button type="button" onClick={copy}>
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setLink(null)}>
                Make another
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="share-from">From</Label>
                <Input id="share-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="share-to">To</Label>
                <Input id="share-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="share-scope">Which work</Label>
              <select
                id="share-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="">Everything</option>
                {clients.data?.map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    <option value={`c:${c.id}`}>All of {c.name}</option>
                    {c.projects.map((p) => (
                      <option key={p.id} value={`p:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
              Include my descriptions of what I did
            </label>

            <div className="grid gap-1.5">
              <Label htmlFor="share-expiry">Link works for</Label>
              <select
                id="share-expiry"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {SHARE_EXPIRY_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </div>

            <p className={`text-sm ${check.ok ? "text-muted-foreground" : "text-destructive"}`} aria-live="polite">
              {check.ok ? describeRange(from, to) : check.message}
            </p>

            <Button onClick={make} disabled={!check.ok || create.isPending}>
              <Send /> {create.isPending ? "Making the link…" : "Make a link"}
            </Button>
          </>
        )}

        {shares.data && shares.data.length > 0 && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="font-medium text-sm">Links you've made</p>
            <ul className="flex flex-col gap-2">
              {shares.data.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{s.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {s.status === "approved" ? `Approved by ${s.approved_name}` : STATUS_LABEL[s.status]}
                    </p>
                  </div>
                  {s.status === "waiting" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => turnOff(s.id)}
                      disabled={revoke.isPending}
                    >
                      Turn off
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useState } from "react";

import { Check, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_LINK_EXPIRY_DAYS, LINK_EXPIRY_DAYS, type LinkStatus } from "@/lib/invoice-link";
import { trpc } from "@/lib/trpc";

const STATUS_LABEL: Record<LinkStatus, string> = { live: "Works now", revoked: "Turned off", expired: "Expired" };
const dateOf = (d: Date | string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * A private link to one invoice, to paste into your own email or message. The page it opens shows a frozen copy of the
 * invoice with a PDF download; it never changes after you send it. Shown once, like an API token.
 */
export function ShareInvoice({ invoiceId, number }: { invoiceId: string; number: string }) {
  const utils = trpc.useUtils();
  const create = trpc.invoiceLink.create.useMutation();
  const revoke = trpc.invoiceLink.revoke.useMutation();
  const [open, setOpen] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number>(DEFAULT_LINK_EXPIRY_DAYS);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const links = trpc.invoiceLink.list.useQuery({ invoiceId }, { enabled: open });

  async function make() {
    try {
      const out = await create.mutateAsync({ invoiceId, expiresInDays });
      setLink(`${window.location.origin}/invoice/${out.token}`);
      setCopied(false);
      await utils.invoiceLink.list.invalidate({ invoiceId });
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
      await utils.invoiceLink.list.invalidate({ invoiceId });
      toast.success("That link is turned off.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't turn it off.");
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setLink(null);
          setCopied(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Get a link to ${number}`} title="Get a link to send">
          <Link2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-[80vh] w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto"
      >
        <div>
          <p className="font-medium">Link to {number}</p>
          <p className="text-muted-foreground text-sm">
            A private page with the invoice and a PDF download. Paste it into your own email.
          </p>
        </div>

        {link ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
            <p className="font-medium text-sm">Copy it now: it is shown only once.</p>
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invoice link" />
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
            <div className="grid gap-1.5">
              <Label htmlFor={`link-expiry-${invoiceId}`}>Link works for</Label>
              <select
                id={`link-expiry-${invoiceId}`}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {LINK_EXPIRY_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={make} disabled={create.isPending}>
              <Link2 /> {create.isPending ? "Making the link…" : "Make a link"}
            </Button>
          </>
        )}

        {links.data && links.data.length > 0 && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="font-medium text-sm">Links for this invoice</p>
            <ul className="flex flex-col gap-2">
              {links.data.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    Made {dateOf(l.created_at)} · {STATUS_LABEL[l.status]}
                  </span>
                  {l.status === "live" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => turnOff(l.id)}
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

"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Check, Copy, Link2, Mail, X } from "lucide-react";
import { toast } from "sonner";

import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_LINK_EXPIRY_DAYS, LINK_EXPIRY_DAYS, type LinkStatus } from "@/lib/invoice-link";
import { MAX_INVOICE_NOTE } from "@/lib/invoice-mail";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

const when = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const LINK_STATUS: Record<LinkStatus, string> = { live: "Works now", revoked: "Turned off", expired: "Expired" };

/** Email the invoice to the client from "<you> via UseHourly"; their reply comes to you. Optional overdue reminders. */
function EmailSection({ invoiceId, open }: { invoiceId: string; open: boolean }) {
  const utils = trpc.useUtils();
  const send = trpc.invoiceMail.send.useMutation();
  const setReminders = trpc.invoiceMail.setReminders.useMutation();
  const [note, setNote] = useState("");
  const [remind, setRemind] = useState(false);
  const info = trpc.invoiceMail.recipient.useQuery({ invoiceId }, { enabled: open });
  const data = info.data;

  useEffect(() => {
    if (open) setRemind(false);
  }, [open]);

  async function submit() {
    try {
      const out = await send.mutateAsync({ invoiceId, note, remindOverdue: remind });
      toast.success(`Sent to ${out.to}.`);
      setNote("");
      await utils.invoiceMail.recipient.invalidate({ invoiceId });
    } catch (err) {
      toastError(err, "Couldn't send the email.");
    }
  }

  async function toggleReminders(enabled: boolean) {
    try {
      await setReminders.mutateAsync({ invoiceId, enabled });
      await utils.invoiceMail.recipient.invalidate({ invoiceId });
    } catch (err) {
      toastError(err, "Couldn't change that.");
    }
  }

  const noAddress = data && !data.blocked && !data.email;

  return (
    <section className="flex flex-col gap-3" aria-label="Email the invoice">
      <div>
        <h3 className="flex items-center gap-1.5 font-medium">
          <Mail className="size-4" /> Email it to your client
        </h3>
        {data?.email ? (
          <p className="text-muted-foreground text-sm">
            To <span className="break-all font-medium text-foreground">{data.email}</span>. They get a button to a
            private page with the invoice. Their reply comes to you.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Sent from you via UseHourly. Their reply comes to you.</p>
        )}
      </div>

      {info.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {data?.blocked && (
        <p className="rounded-lg border border-destructive/40 p-2 text-destructive text-sm">
          {data.blocked}{" "}
          {data.blocked.includes("Confirm your own email") && (
            <Link href="/dashboard/account" className="font-medium underline">
              Go to Account
            </Link>
          )}
        </p>
      )}
      {noAddress && (
        <p className="rounded-lg border p-2 text-sm">
          {data?.clientName ?? "This client"} has no email address yet.{" "}
          <Link href="/dashboard/clients" className="font-medium underline">
            Add one under Clients
          </Link>
          , in Billing details.
        </p>
      )}

      {data && !data.blocked && data.email && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor={`mail-note-${invoiceId}`}>A note to include (optional)</Label>
            <Textarea
              id={`mail-note-${invoiceId}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={MAX_INVOICE_NOTE}
              placeholder="Thanks for the great month. Let me know if anything looks off."
            />
            <p className="text-muted-foreground text-xs">It's shown as a note from you, under the invoice summary.</p>
          </div>
          {data.dueDate && !data.paid && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
              <span>Remind them if it's still unpaid a day after the due date, and again a week after.</span>
            </label>
          )}
          <Button onClick={submit} disabled={send.isPending} className="self-start">
            <Mail /> {send.isPending ? "Sending…" : "Send the email"}
          </Button>
        </>
      )}

      {data?.remindOverdue && !data.paid && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Reminders are on ({data.remindersSent} of 2 sent).</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => toggleReminders(false)}
            disabled={setReminders.isPending}
          >
            Turn off
          </Button>
        </div>
      )}

      {data && data.history.length > 0 && (
        <ul className="flex flex-col gap-1 text-muted-foreground text-xs" aria-label="Already sent">
          {data.history.map((h) => (
            <li key={`${h.kind}|${h.to_email}|${String(h.created_at)}`}>
              {h.kind === "reminder" ? "Reminder" : "Invoice"} to {h.to_email} · {when(h.created_at)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A private link to paste into your own email or message. Shown once, like an API token. */
function LinkSection({ invoiceId, open }: { invoiceId: string; open: boolean }) {
  const utils = trpc.useUtils();
  const create = trpc.invoiceLink.create.useMutation();
  const revoke = trpc.invoiceLink.revoke.useMutation();
  const [expiresInDays, setExpiresInDays] = useState<number>(DEFAULT_LINK_EXPIRY_DAYS);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const links = trpc.invoiceLink.list.useQuery({ invoiceId }, { enabled: open });

  useEffect(() => {
    if (open) {
      setLink(null);
      setCopied(false);
    }
  }, [open]);

  async function make() {
    try {
      const out = await create.mutateAsync({ invoiceId, expiresInDays });
      setLink(`${window.location.origin}/invoice/${out.token}`);
      setCopied(false);
      await utils.invoiceLink.list.invalidate({ invoiceId });
    } catch (err) {
      toastError(err, "Couldn't make the link.");
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
      toastError(err, "Couldn't turn it off.");
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-4" aria-label="Copy a link">
      <div>
        <h3 className="flex items-center gap-1.5 font-medium">
          <Link2 className="size-4" /> Or copy a link to send yourself
        </h3>
        <p className="text-muted-foreground text-sm">A private page with the invoice and a PDF download.</p>
      </div>

      {link ? (
        <Notice className="flex flex-col gap-2">
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
        </Notice>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`link-expiry-${invoiceId}`}>Link works for</Label>
            <select
              id={`link-expiry-${invoiceId}`}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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
        </div>
      )}

      {links.data && links.data.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Links for this invoice">
          {links.data.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                Made {when(l.created_at)} · {LINK_STATUS[l.status]}
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
      )}
    </section>
  );
}

/**
 * Everything about getting an invoice to a client, opened inside the invoice's own card (not in a popup): email it from
 * here, or copy a link and send it your own way. The card owns whether it is open.
 */
export function SendInvoicePanel({
  invoice,
  onClose,
}: {
  invoice: { id: string; number: string };
  onClose: () => void;
}) {
  return (
    <section aria-label={`Send invoice ${invoice.number}`} className="flex flex-col gap-4 border-t bg-band-3 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-base">Send invoice {invoice.number}</h3>
          <p className="text-foreground/75 text-sm">Email it from here, or copy a link and send it your own way.</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-10 shrink-0"
          onClick={onClose}
          aria-label="Close"
        >
          <X />
        </Button>
      </div>
      <EmailSection invoiceId={invoice.id} open />
      <LinkSection invoiceId={invoice.id} open />
    </section>
  );
}

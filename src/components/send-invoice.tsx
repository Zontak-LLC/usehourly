"use client";

import { useState } from "react";

import { Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { MAX_INVOICE_NOTE } from "@/lib/invoice-mail";
import { trpc } from "@/lib/trpc";

const when = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * Email the invoice to the client from here: they get a message from "<you> via UseHourly" with a button to the private
 * invoice page, and their reply comes to you. Optional reminders if it is still unpaid after the due date.
 */
export function SendInvoice({ invoiceId, number }: { invoiceId: string; number: string }) {
  const utils = trpc.useUtils();
  const send = trpc.invoiceMail.send.useMutation();
  const setReminders = trpc.invoiceMail.setReminders.useMutation();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [remind, setRemind] = useState(false);
  const info = trpc.invoiceMail.recipient.useQuery({ invoiceId }, { enabled: open });
  const data = info.data;

  async function submit() {
    try {
      const out = await send.mutateAsync({ invoiceId, note, remindOverdue: remind });
      toast.success(`Sent to ${out.to}.`);
      setNote("");
      await utils.invoiceMail.recipient.invalidate({ invoiceId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the email.");
    }
  }

  async function toggleReminders(enabled: boolean) {
    try {
      await setReminders.mutateAsync({ invoiceId, enabled });
      await utils.invoiceMail.recipient.invalidate({ invoiceId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change that.");
    }
  }

  const cannot = data
    ? (data.blocked ??
      (data.email
        ? null
        : `Add an email address for ${data.clientName ?? "this client"} under My work, Billing details.`))
    : null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setRemind(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Email ${number} to the client`} title="Email to the client">
          <Mail />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-[80vh] w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto"
      >
        <div>
          <p className="font-medium">Email {number}</p>
          {data?.email ? (
            <p className="text-muted-foreground text-sm">
              To <span className="break-all font-medium text-foreground">{data.email}</span>. They get a button to a
              private page with the invoice. Their reply comes to you.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">Send the invoice with one click, from you via UseHourly.</p>
          )}
        </div>

        {info.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {cannot && <p className="rounded-lg border border-destructive/40 p-2 text-destructive text-sm">{cannot}</p>}

        {data && !cannot && (
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
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={remind}
                  onChange={(e) => setRemind(e.target.checked)}
                />
                <span>Remind them if it's still unpaid a day after the due date, and again a week after.</span>
              </label>
            )}
            <Button onClick={submit} disabled={send.isPending}>
              <Mail /> {send.isPending ? "Sending…" : "Send the email"}
            </Button>
          </>
        )}

        {data && data.remindOverdue && !data.paid && (
          <div className="flex items-center justify-between gap-2 border-t pt-3 text-sm">
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
          <div className="flex flex-col gap-1 border-t pt-3">
            <p className="font-medium text-sm">Sent</p>
            <ul className="flex flex-col gap-1 text-muted-foreground text-xs">
              {data.history.map((h) => (
                <li key={`${h.kind}|${h.to_email}|${String(h.created_at)}`}>
                  {h.kind === "reminder" ? "Reminder" : "Invoice"} to {h.to_email} · {when(h.created_at)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

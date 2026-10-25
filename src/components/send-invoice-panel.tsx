"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Check, Copy, Download, Mail, Share, X } from "lucide-react";
import { toast } from "sonner";

import { Notice } from "@/components/notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatInstant } from "@/lib/dates";
import { invoiceDraft, MAILTO_SAFE_LENGTH, mailtoHref, pdfFileName, reminderDraft } from "@/lib/invoice-draft";
import { DEFAULT_LINK_EXPIRY_DAYS, type LinkStatus } from "@/lib/invoice-link";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

const LINK_STATUS: Record<LinkStatus, string> = { live: "Works now", revoked: "Turned off", expired: "Expired" };

type PanelInvoice = {
  id: string;
  number: string;
  total_cents: number;
  currency: string;
  period_from: string;
  period_to: string;
  issue_date: string;
  due_date: string | null;
  paid_date: string | null;
};

/*
 * One private link per invoice per page visit: opening the panel again (or React running an effect twice) reuses it
 * instead of making another, because an invoice may have only a few live links. The token lives in memory only.
 */
const linkByInvoice = new Map<string, Promise<{ id: string; url: string }>>();

/** Whether this browser can hand a PDF file to the mail app (phones, Safari on a Mac). */
function canShareFiles() {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File([""], "invoice.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied.`);
    return true;
  } catch {
    toast.info(`Select the ${what.toLowerCase()} and copy it by hand.`);
    return false;
  }
}

/**
 * The email, written for the person to send from their own mail app (issue 227). The private link is made when the
 * panel opens; "Open in my email app" fills in a new email; the person checks it and presses Send there.
 */
function MailAppSection({
  invoice,
  reminder,
  linkOff,
  onLink,
  onRewrite,
}: {
  invoice: PanelInvoice;
  /** Days late: write a reminder for an overdue invoice instead of the invoice email. */
  reminder?: number;
  /** The link in this email was turned off below. */
  linkOff: boolean;
  onLink: (id: string) => void;
  onRewrite: () => void;
}) {
  const utils = trpc.useUtils();
  const createLink = trpc.invoiceLink.create.useMutation();
  const recipient = trpc.invoiceMail.recipient.useQuery({ invoiceId: invoice.id });
  const full = trpc.invoice.get.useQuery({ id: invoice.id });
  const [link, setLink] = useState<string | null>(null);
  const [linkFailed, setLinkFailed] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [shareable] = useState(canShareFiles);
  const [copied, setCopied] = useState(false);

  // Make (or reuse) this visit's private link.
  // biome-ignore lint/correctness/useExhaustiveDependencies: made once per invoice; the mutation object changes each render.
  useEffect(() => {
    let live = true;
    let pending = linkByInvoice.get(invoice.id);
    if (!pending) {
      pending = createLink
        .mutateAsync({ invoiceId: invoice.id, expiresInDays: DEFAULT_LINK_EXPIRY_DAYS })
        .then((out) => ({ id: out.id, url: `${window.location.origin}/invoice/${out.token}` }));
      linkByInvoice.set(invoice.id, pending);
      pending.then(
        () => utils.invoiceLink.list.invalidate({ invoiceId: invoice.id }),
        () => linkByInvoice.delete(invoice.id),
      );
    }
    pending.then(
      (made) => {
        if (!live) return;
        setLink(made.url);
        onLink(made.id);
      },
      (err: unknown) => live && setLinkFailed(err instanceof Error ? err.message : "Couldn't make a link."),
    );
    return () => {
      live = false;
    };
  }, [invoice.id]);

  const snapshot = full.data?.snapshot;
  const linkSettled = link !== null || linkFailed !== null;

  // Write the draft once everything it needs is here; after that the words are the person's own.
  useEffect(() => {
    if (!snapshot || !linkSettled || body !== null) return;
    const input = {
      number: invoice.number,
      sellerName: snapshot.seller.name,
      totalCents: invoice.total_cents,
      currency: invoice.currency,
      periodFrom: invoice.period_from,
      periodTo: invoice.period_to,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      paidDate: invoice.paid_date,
      link,
    };
    const draft = reminder ? reminderDraft({ ...input, daysLate: reminder }) : invoiceDraft(input);
    setSubject(draft.subject);
    setBody(draft.body);
  }, [snapshot, linkSettled, body, link, invoice, reminder]);

  useEffect(() => {
    // Without the client's address (or if it could not be read) the box starts empty: the person types one.
    if (to === null && (recipient.data || recipient.isError)) setTo(recipient.data?.email ?? "");
  }, [recipient.data, recipient.isError, to]);

  // Build the PDF ahead of time where it can be shared, so the Share button can open the share sheet at once (browsers
  // only allow it straight after a tap, not after waiting for a download).
  useEffect(() => {
    if (!shareable || !snapshot) return;
    let live = true;
    void import("@/lib/invoice-pdf")
      .then(({ buildInvoicePdf }) => buildInvoicePdf(snapshot))
      .then((doc) => {
        if (live) setPdf(new File([doc.output("blob")], pdfFileName(snapshot.number), { type: "application/pdf" }));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [shareable, snapshot]);

  async function download() {
    if (!snapshot) return;
    try {
      const { downloadInvoicePdf } = await import("@/lib/invoice-pdf");
      await downloadInvoicePdf(snapshot);
    } catch (err) {
      toastError(err, "Couldn't make the PDF.");
    }
  }

  async function share() {
    if (!pdf || body === null) return;
    try {
      await navigator.share({ files: [pdf], title: subject ?? "", text: body });
    } catch (err) {
      // Closing the share sheet is not a problem.
      if (!(err instanceof DOMException && err.name === "AbortError"))
        toast.info("Sharing didn't work. Use Download PDF.");
    }
  }

  if (full.isError) {
    return (
      <Notice tone="danger" className="flex flex-col items-start gap-2 text-sm">
        <p>Couldn't load this invoice to write the email.</p>
        <Button type="button" variant="outline" onClick={() => void full.refetch()}>
          Try again
        </Button>
      </Notice>
    );
  }
  if (body === null || subject === null || to === null) {
    return <p className="text-muted-foreground text-sm">Writing the email…</p>;
  }

  const href = mailtoHref(to, subject, body);
  const tooLong = href.length > MAILTO_SAFE_LENGTH;
  const id = invoice.id;

  return (
    <section className="flex flex-col gap-3" aria-label="Email from your own app">
      {linkOff && (
        <Notice className="flex flex-col items-start gap-2 text-sm">
          <p>The link in this email is turned off now, so it no longer opens.</p>
          <Button type="button" variant="outline" onClick={onRewrite}>
            Write it again with a new link
          </Button>
        </Notice>
      )}
      {linkFailed && (
        <Notice tone="danger" className="flex flex-col items-start gap-2 text-sm">
          <p>
            {linkFailed} The email has no link, so attach the PDF yourself.
            {/* The live-link limit: links can be turned off in the list below, then the email written again. */}
            {/turn (one|some) off/i.test(linkFailed) && " Or turn off a link you no longer need below, then try again."}
          </p>
          {/turn (one|some) off/i.test(linkFailed) && (
            <Button type="button" variant="outline" onClick={onRewrite}>
              Try again with a link
            </Button>
          )}
        </Notice>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={`mail-to-${id}`}>To</Label>
        <Input
          id={`mail-to-${id}`}
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="client@example.com"
          autoComplete="off"
        />
        {!to && (
          <p className="text-muted-foreground text-xs">
            Type it here, or save it under{" "}
            <Link href="/dashboard/clients" className="underline">
              Clients
            </Link>{" "}
            (Billing details) for next time.
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`mail-subject-${id}`}>Subject</Label>
        <Input id={`mail-subject-${id}`} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`mail-body-${id}`}>Message</Label>
        <Textarea id={`mail-body-${id}`} value={body} onChange={(e) => setBody(e.target.value)} rows={9} />
      </div>
      {tooLong && (
        <p className="text-muted-foreground text-xs">
          The message is long, so some mail apps may cut it. Use Copy message and paste it instead.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <a href={href} className={buttonVariants({ className: "gap-1.5" })}>
          <Mail /> Open in my email app
        </a>
        {shareable && (
          <Button type="button" variant="outline" onClick={share} disabled={!pdf}>
            <Share /> {pdf ? "Share with the PDF" : "Making the PDF…"}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={async () => setCopied(await copyText(body, "Message"))}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy message"}
        </Button>
        <Button type="button" variant="outline" onClick={download} disabled={!snapshot}>
          <Download /> Download PDF
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Nothing is sent from here. Your mail app opens with this email ready: check it and press Send.
        {shareable ? " Share with the PDF attaches the invoice file (add the address in your mail app)." : ""}
      </p>
      {link && !linkOff && (
        <div className="grid gap-1.5">
          <Label htmlFor={`invoice-link-${id}`}>Invoice link</Label>
          <div className="flex gap-2">
            <Input id={`invoice-link-${id}`} readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" onClick={() => copyText(link, "Link")}>
              <Copy /> Copy link
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            A private page with the invoice and a PDF download. It works for {DEFAULT_LINK_EXPIRY_DAYS} days. Anyone
            with it can see the invoice.
          </p>
        </div>
      )}
    </section>
  );
}

/** The private links made for this invoice, with Turn off for any that still work. */
function LinkList({ invoiceId, onTurnedOff }: { invoiceId: string; onTurnedOff: (id: string) => void }) {
  const utils = trpc.useUtils();
  const revoke = trpc.invoiceLink.revoke.useMutation();
  const links = trpc.invoiceLink.list.useQuery({ invoiceId });

  async function turnOff(id: string) {
    try {
      await revoke.mutateAsync({ id });
      onTurnedOff(id);
      await utils.invoiceLink.list.invalidate({ invoiceId });
      toast.success("That link is turned off.");
    } catch (err) {
      toastError(err, "Couldn't turn it off.");
    }
  }

  if (!links.data || links.data.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 border-t pt-3" aria-label="Links for this invoice">
      {links.data.map((l) => (
        <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            Link made {formatInstant(l.created_at, "day")} · {LINK_STATUS[l.status]}
          </span>
          {l.status === "live" && (
            <Button type="button" size="sm" variant="ghost" onClick={() => turnOff(l.id)} disabled={revoke.isPending}>
              Turn off
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Getting an invoice to a client, opened inside the invoice's own card (not in a popup): an email written for the
 * person's own mail app, with the private link and the PDF. UseHourly never sends it: the server-sent "Send the email"
 * button was removed (2026-10-23, issue 227); `invoiceMail.send` and the reminders stay on the server, unused by the screens.
 * The card owns whether it is open.
 */
export function SendInvoicePanel({
  invoice,
  onClose,
  reminder,
}: {
  invoice: PanelInvoice;
  onClose: () => void;
  /** Days late: the same panel writes a polite reminder instead (issue 100). */
  reminder?: number;
}) {
  const title = reminder ? `Write a reminder for ${invoice.number}` : `Send invoice ${invoice.number}`;
  // Which link the email holds, whether it was turned off, and a key that writes the email again from the start.
  const [linkId, setLinkId] = useState<string | null>(null);
  const [linkOff, setLinkOff] = useState(false);
  const [draftKey, setDraftKey] = useState(0);
  return (
    <section aria-label={title} className="flex flex-col gap-4 border-t bg-band-3 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-base">{title}</h3>
          <p className="text-foreground/75 text-sm">
            {reminder
              ? "Here is a polite reminder to your client, ready to edit. Send it from your own email app."
              : "Here is an email to your client, ready to edit. Send it from your own email app."}
          </p>
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
      <MailAppSection
        key={draftKey}
        invoice={invoice}
        reminder={reminder}
        linkOff={linkOff}
        onLink={setLinkId}
        onRewrite={() => {
          setLinkOff(false);
          setDraftKey((k) => k + 1);
        }}
      />
      <LinkList
        invoiceId={invoice.id}
        onTurnedOff={(id) => {
          if (id !== linkId) return;
          linkByInvoice.delete(invoice.id); // the next email gets a fresh link
          setLinkOff(true);
        }}
      />
    </section>
  );
}

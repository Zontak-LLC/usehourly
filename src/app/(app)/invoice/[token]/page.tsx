import Link from "next/link";

import type { Metadata } from "next";

import { InvoiceDocument, readSnapshot } from "@/components/invoice-document";
import { LogoMark } from "@/components/logo";
import { formatDate } from "@/lib/dates";
import { getPrisma } from "@/lib/prisma";
import { findInvoiceLinkByToken } from "@/server/invoice-link";
import { withInvoiceLogos } from "@/server/invoice-logos";

// A private link: never indexed, never followed, and the address is not passed on when someone clicks out.
export const metadata: Metadata = {
  title: "Invoice · UseHourly",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-3xl items-center px-4 py-5 print:hidden">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <LogoMark className="size-7" />
          UseHourly
        </Link>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 pb-16 print:pb-0">{children}</main>
    </div>
  );
}

/** Unknown, turned-off and expired links all read the same, so a link cannot be used to find out which it was. */
function Unavailable() {
  return (
    <Frame>
      <div className="rounded-xl border bg-card p-6">
        <h1 className="font-semibold text-xl">This link isn't available any more</h1>
        <p className="mt-2 text-muted-foreground">
          The invoice link was turned off or has expired. Ask the person who sent it for a new one.
        </p>
      </div>
    </Frame>
  );
}

export default async function SharedInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const prisma = await getPrisma();
  const link = await findInvoiceLinkByToken(prisma, token);
  const now = Math.floor(Date.now() / 1000);
  if (!link || link.revoked_at !== null || link.expires_at <= now) return <Unavailable />;

  // The invoice must belong to the account that made the link (it always does; this keeps the page honest).
  const invoice = await prisma.invoice.findFirst({
    where: { id: link.invoice_id, user_id: link.user_id },
    select: { snapshot: true, paid_date: true },
  });
  const frozen = invoice ? readSnapshot(invoice.snapshot) : null;
  if (!invoice || !frozen) return <Unavailable />;
  const s = await withInvoiceLogos(prisma, link.user_id, frozen);

  return (
    <Frame>
      <InvoiceDocument s={s} paidDate={invoice.paid_date} />

      <p className="text-muted-foreground text-xs print:hidden">
        Sent with UseHourly. This link works until{" "}
        {formatDate(new Date(link.expires_at * 1000).toISOString().slice(0, 10), "day")}.
      </p>
    </Frame>
  );
}

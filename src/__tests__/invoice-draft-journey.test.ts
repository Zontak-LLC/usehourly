import { describe, expect, it } from "vitest";

import { invoiceDraft, MAILTO_SAFE_LENGTH, mailtoHref, pdfFileName } from "@/lib/invoice-draft";

/*
 * Issue issue 227: a freelancer sends an invoice from their own mail app. UseHourly writes the email; the mailto address
 * must carry exactly that email to the mail app, and nothing a person types can add a header (Bcc, a second To).
 */

const base = {
  number: "INV-2026-007",
  sellerName: "Dana Ruiz Design",
  totalCents: 180000,
  currency: "USD",
  periodFrom: "2026-10-01",
  periodTo: "2026-10-31",
  issueDate: "2026-11-01",
  dueDate: "2026-11-16",
  paidDate: null,
  link: "https://usehourly.app/invoice/abc123",
};

/** Reads a mailto address back the way a mail app does. */
function openInMailApp(href: string) {
  const [, rest] = href.split("mailto:");
  const [to, query] = rest.split("?");
  const params = new URLSearchParams(query.replace(/\+/g, "%2B"));
  return {
    to: decodeURIComponent(to),
    subject: params.get("subject"),
    body: params.get("body"),
    keys: [...params.keys()],
  };
}

describe("emailing an invoice from your own mail app", () => {
  it("an unpaid invoice: the client reads the amount, the period, the due date and the private link", () => {
    const { subject, body } = invoiceDraft(base);
    expect(subject).toBe("Invoice INV-2026-007 from Dana Ruiz Design");
    expect(body).toContain("Here is invoice INV-2026-007 for $1,800.00, for work from Oct 1, 2026 to Oct 31, 2026.");
    expect(body).toContain("Payment is due by Nov 16, 2026.");
    expect(body).toContain("You can view the invoice and download the PDF here:\nhttps://usehourly.app/invoice/abc123");
    expect(body.trimEnd().endsWith("Thank you!\nDana Ruiz Design")).toBe(true);
  });

  it("due on receipt, paid, no due date and no link each read correctly", () => {
    expect(invoiceDraft({ ...base, dueDate: base.issueDate }).body).toContain("Payment is due on receipt.");
    const paid = invoiceDraft({ ...base, paidDate: "2026-11-10" }).body;
    expect(paid).toContain("It is paid (Nov 10, 2026). This copy is for your records.");
    expect(paid).not.toContain("due");
    expect(invoiceDraft({ ...base, dueDate: null }).body).not.toMatch(/due/i);
    const noLink = invoiceDraft({ ...base, link: null }).body;
    expect(noLink).toContain("The invoice is attached as a PDF.");
    expect(noLink).not.toContain("http");
  });

  it("uses the invoice's own currency and leaves out an empty seller name", () => {
    const euro = invoiceDraft({ ...base, currency: "EUR", sellerName: "  " });
    expect(euro.subject).toBe("Invoice INV-2026-007");
    expect(euro.body).toContain("€1,800.00");
    expect(euro.body.trimEnd().endsWith("Thank you!")).toBe(true);
  });

  it("the mail app gets exactly the address, subject and message, line breaks included", () => {
    const { subject, body } = invoiceDraft(base);
    const mail = openInMailApp(mailtoHref("pay@acme.studio", subject, body));
    expect(mail.to).toBe("pay@acme.studio");
    expect(mail.subject).toBe(subject);
    expect(mail.body).toBe(body.replace(/\n/g, "\r\n"));
    expect(mailtoHref("pay@acme.studio", "s", "b").startsWith("mailto:pay@acme.studio?")).toBe(true); // a readable @
  });

  it("typed text cannot add a header: a ? or & in the address, subject or message stays text", () => {
    const href = mailtoHref("pay@acme.studio?bcc=spy@evil.test", "A & B?cc=x@evil.test", "50% & more&bcc=y@evil.test");
    const mail = openInMailApp(href);
    expect(mail.keys).toEqual(["subject", "body"]);
    expect(mail.to).toBe("pay@acme.studio?bcc=spy@evil.test");
    expect(mail.subject).toBe("A & B?cc=x@evil.test");
    expect(mail.body).toBe("50% & more&bcc=y@evil.test");
  });

  it("several addresses separated by commas or semicolons, blanks dropped", () => {
    expect(mailtoHref(" a@x.co ; b@y.co,, ", "s", "b")).toMatch(/^mailto:a@x\.co,b@y\.co\?/);
    expect(mailtoHref("", "s", "b")).toMatch(/^mailto:\?subject=s&body=b$/);
  });

  it("a normal draft fits a mailto address; a very long message is flagged as too long", () => {
    const { subject, body } = invoiceDraft(base);
    expect(mailtoHref("pay@acme.studio", subject, body).length).toBeLessThan(MAILTO_SAFE_LENGTH);
    expect(mailtoHref("pay@acme.studio", subject, `${body}\n${"Extra words. ".repeat(200)}`).length).toBeGreaterThan(
      MAILTO_SAFE_LENGTH,
    );
  });

  it("the PDF attachment has a safe file name", () => {
    expect(pdfFileName("INV-2026-007")).toBe("INV-2026-007.pdf");
    expect(pdfFileName("INV/2026 7")).toBe("INV_2026_7.pdf");
  });
});

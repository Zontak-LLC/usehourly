// Generator for public/examples/example-invoice.pdf (uses the real PDF code). See public/examples/README.md.

import { expect, it } from "vitest";

import type { InvoiceSnapshot } from "@/lib/invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

import { readFileSync, writeFileSync } from "node:fs";

const logo = `data:image/png;base64,${readFileSync(process.env.LOGO_PATH ?? "").toString("base64")}`;
const line = (projectId: string, project: string, minutes: number, rateCents: number) => ({
  projectId,
  project,
  minutes,
  rateCents,
  amountCents: Math.round((minutes * rateCents) / 60),
});
const lines = [
  line("p1", "Brand refresh", 18 * 60, 9500),
  line("p2", "Website redesign", 26 * 60 + 30, 9500),
  line("p3", "Packaging artwork", 9 * 60 + 15, 8500),
  line("p4", "Social media templates", 6 * 60, 7500),
];
const detail = [
  ["2026-09-01", "Brand refresh", "Kick-off call; mood boards and three logo directions", 180],
  ["2026-09-02", "Brand refresh", "Logo direction B refined; colour palette and type pairing", 240],
  ["2026-09-04", "Brand refresh", "Brand guide draft: logo use, colours, typography", 210],
  ["2026-09-08", "Brand refresh", "Client feedback round; final logo files (SVG, PNG, PDF)", 150],
  ["2026-09-09", "Brand refresh", "Brand guide final and hand-off", 300],
  ["2026-09-10", "Website redesign", "Sitemap and wireframes for home, menu and locations", 270],
  ["2026-09-11", "Website redesign", "Home page design, desktop and phone", 300],
  ["2026-09-14", "Website redesign", "Menu and locations pages; image direction", 240],
  ["2026-09-15", "Website redesign", "Online ordering flow, three screens", 330],
  ["2026-09-17", "Website redesign", "Design review with the Northwind team; revisions", 180],
  ["2026-09-18", "Website redesign", "Component library and hand-off notes for the developer", 270],
  ["2026-09-21", "Packaging artwork", "Bag artwork for the autumn blend, two sizes", 240],
  ["2026-09-22", "Packaging artwork", "Label system for single origins", 180],
  ["2026-09-23", "Packaging artwork", "Print-ready files and proof check with the printer", 135],
  ["2026-09-24", "Website redesign", "Accessibility pass: contrast and focus states", 180],
  ["2026-09-25", "Social media templates", "Instagram post and story templates, 12 layouts", 240],
  ["2026-09-28", "Social media templates", "Launch week announcement set", 120],
  ["2026-09-29", "Website redesign", "Final QA with the developer on staging", 120],
].map(([date, project, note, minutes]) => ({ date, project, note, minutes })) as InvoiceSnapshot["detail"];

it("writes the example invoice", async () => {
  const snapshot: InvoiceSnapshot = {
    currency: "USD",
    seller: {
      name: "Okafor Design Studio",
      ein: "12-3456789",
      address: "Maya Okafor\n1420 South Congress Ave, Suite 210\nAustin, TX 78704",
      email: "maya@okaforstudio.example",
      logo,
      paymentInstructions:
        "Bank transfer (ACH)\nAccount name: Okafor Design Studio LLC\nRouting number: 000000000 (example)\nAccount number: 0000 0000 0000 (example)",
    },
    client: {
      name: "Northwind Coffee",
      legalName: "Northwind Coffee Company, LLC",
      address: "Attn: Priya Raman, Marketing\n815 NW 13th Ave\nPortland, OR 97209",
    },
    number: "INV-2026-014",
    issueDate: "2026-10-01",
    dueDate: "2026-10-31",
    periodFrom: "2026-09-01",
    periodTo: "2026-09-30",
    notes:
      "Thank you for a great month, Priya! Payment is due within 30 days. Questions about this invoice: reply to this email.",
    includeDetail: true,
    lines,
    detail,
    totalMinutes: lines.reduce((s, l) => s + l.minutes, 0),
    totalCents: lines.reduce((s, l) => s + l.amountCents, 0),
  };
  const doc = await buildInvoicePdf(snapshot);
  const bytes = Buffer.from(doc.output("arraybuffer"));
  writeFileSync("public/examples/example-invoice.pdf", bytes);
  expect(bytes.length).toBeGreaterThan(1000);
});

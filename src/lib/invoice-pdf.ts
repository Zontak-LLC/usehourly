import { fromISODate } from "@/lib/dates";
import { formatDecimalHours } from "@/lib/duration";
import type { InvoiceSnapshot } from "@/lib/invoice";
import { formatMoneyForPdf as formatMoney } from "@/lib/money";
import { shortNote } from "@/lib/notes";
import { describeRounding } from "@/lib/rounding";

const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });
const fmtDate = (iso: string) => dateFmt.format(fromISODate(iso));

const MARGIN = 48;
const INK: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [113, 113, 122];
const RULE: [number, number, number] = [228, 228, 231];

/**
 * Render an invoice snapshot to a PDF (US Letter). Runs in the browser; jsPDF is imported on
 * demand so it never lands in the main bundle. Takes the stored snapshot, not live data, so a
 * re-download is identical to what was issued.
 */
export async function buildInvoicePdf(snapshot: InvoiceSnapshot) {
  // Drop zero-hour rows at render time too, so invoices saved before this rule re-download cleanly.
  const s: InvoiceSnapshot = {
    ...snapshot,
    lines: snapshot.lines.filter((l) => l.minutes > 0),
    detail: snapshot.detail.filter((d) => d.minutes > 0),
  };
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const right = pageW - MARGIN;
  let y = MARGIN;

  // ── Header ──────────────────────────────────────────────────────────────
  // Left: your logo (or business name), then INVOICE and its number/dates.
  // Right: the client's logo, name and billing address (the "bill to" block).
  const logoImage = (dataUrl: string, x: number, top: number, maxW: number, maxH: number, alignRight = false) => {
    try {
      const props = doc.getImageProperties(dataUrl);
      const scale = Math.min(maxW / props.width, maxH / props.height, 1);
      const w = props.width * scale;
      const h = props.height * scale;
      doc.addImage(dataUrl, props.fileType, alignRight ? x - w : x, top, w, h);
      return h;
    } catch {
      // A corrupt logo shouldn't block the invoice; callers fall back to text.
      return null;
    }
  };
  const lines = (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  // Left column
  let ly = y;
  const sellerLogoH = s.seller.logo ? logoImage(s.seller.logo, MARGIN, ly, 170, 64) : null;
  if (sellerLogoH === null) {
    s.seller.logo = null;
    doc
      .setFont("helvetica", "bold")
      .setFontSize(18)
      .setTextColor(...INK);
    doc.text(s.seller.name, MARGIN, ly + 16);
    ly += 24;
  } else {
    ly += sellerLogoH;
  }
  ly += 22;
  doc
    .setFont("helvetica", "bold")
    .setFontSize(22)
    .setTextColor(...INK);
  doc.text("INVOICE", MARGIN, ly);
  ly += 20;
  doc.setFont("helvetica", "normal").setFontSize(10);
  const meta: [string, string][] = [
    ["Invoice #", s.number],
    ["Issued", fmtDate(s.issueDate)],
    ...(s.dueDate ? ([["Due", fmtDate(s.dueDate)]] as [string, string][]) : []),
  ];
  for (const [k, v] of meta) {
    doc.setTextColor(...MUTED).text(k, MARGIN, ly);
    doc.setTextColor(...INK).text(v, MARGIN + 70, ly);
    ly += 14;
  }

  // Right column (right-aligned)
  let ry = y;
  doc
    .setFont("helvetica", "bold")
    .setFontSize(8)
    .setTextColor(...MUTED);
  doc.text("BILL TO", right, ry + 8, { align: "right" });
  ry += 18;
  if (s.client.logo) {
    const h = logoImage(s.client.logo, right, ry, 170, 64, true);
    if (h !== null) ry += h + 8;
  }
  doc
    .setFont("helvetica", "bold")
    .setFontSize(12)
    .setTextColor(...INK);
  // Full legal name when set, else the short name; wraps rather than overflowing the column.
  const billName = doc.splitTextToSize(s.client.legalName?.trim() || s.client.name, 260) as string[];
  doc.text(billName, right, ry + 10, { align: "right" });
  ry += 3 + billName.length * 14;
  doc.setFont("helvetica", "normal").setFontSize(10);
  for (const l of s.client.address ? lines(s.client.address) : []) {
    const wrapped = doc.splitTextToSize(l, 230) as string[];
    doc.text(wrapped, right, ry + 10, { align: "right" });
    ry += wrapped.length * 13;
  }
  doc.setFontSize(9).setTextColor(...MUTED);
  doc.text(`Services ${fmtDate(s.periodFrom)} – ${fmtDate(s.periodTo)}`, right, ry + 12, { align: "right" });
  ry += 16;

  y = Math.max(ly, ry) + 20;

  // ── From (your business details) ────────────────────────────────────────
  const fromLines = [
    ...(s.seller.logo ? [s.seller.name] : []),
    ...(s.seller.address ? lines(s.seller.address) : []),
    ...(s.seller.ein ? [`EIN ${s.seller.ein}`] : []),
    s.seller.email,
  ];
  doc
    .setFont("helvetica", "bold")
    .setFontSize(8)
    .setTextColor(...MUTED)
    .text("FROM", MARGIN, y);
  let fy = y + 14;
  doc
    .setFont("helvetica", "normal")
    .setFontSize(10)
    .setTextColor(...INK);
  for (const l of fromLines) {
    const wrapped = doc.splitTextToSize(l, 240) as string[];
    doc.text(wrapped, MARGIN, fy);
    fy += wrapped.length * 13;
  }
  y = fy + 20;

  // ── Line items ──────────────────────────────────────────────────────────
  const tableStyles = {
    font: "helvetica",
    fontSize: 10,
    cellPadding: { top: 7, bottom: 7, left: 6, right: 6 },
    textColor: INK,
    lineColor: RULE,
    lineWidth: 0,
  } as const;
  const head = {
    fillColor: [244, 244, 245] as [number, number, number],
    textColor: MUTED,
    fontStyle: "bold" as const,
    fontSize: 8,
  };

  // One bold row per project (hours/rate/amount), then its distinct work descriptions — the
  // time entries' notes — as muted sub-rows, so the invoice says what the work actually was.
  type RowKind = { kind: "project" | "note"; last: boolean };
  const kinds: RowKind[] = [];
  const body: string[][] = [];
  for (const l of s.lines) {
    const seen = new Set<string>();
    const notes: string[] = [];
    for (const d of s.detail) {
      const full = d.note.trim();
      if (d.project !== l.project || !full) continue;
      // Compact mode shortens first, so two notes that start alike collapse into one line.
      const n = s.compactNotes ? shortNote(full) : full;
      if (seen.has(n.toLowerCase())) continue;
      seen.add(n.toLowerCase());
      notes.push(n);
    }
    body.push([
      l.project,
      formatDecimalHours(l.minutes),
      `${formatMoney(l.rateCents, s.currency)}/h`,
      formatMoney(l.amountCents, s.currency),
    ]);
    kinds.push({ kind: "project", last: notes.length === 0 });
    notes.forEach((n, k) => {
      body.push([n, "", "", ""]);
      kinds.push({ kind: "note", last: k === notes.length - 1 });
    });
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Description", "Hours", "Rate", "Amount"]],
    body,
    foot: [["Total", formatDecimalHours(s.totalMinutes), "", formatMoney(s.totalCents, s.currency)]],
    theme: "plain",
    styles: tableStyles,
    headStyles: head,
    footStyles: { fontStyle: "bold", fontSize: 11, textColor: INK },
    columnStyles: {
      1: { halign: "right", cellWidth: 70 },
      2: { halign: "right", cellWidth: 90 },
      3: { halign: "right", cellWidth: 100 },
    },
    didParseCell: (d) => {
      if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = "right";
      if (d.section === "foot" && d.column.index > 0) d.cell.styles.halign = "right";
      if (d.section === "body") {
        const k = kinds[d.row.index];
        if (k?.kind === "project") {
          d.cell.styles.fontStyle = "bold";
          if (!k.last) d.cell.styles.cellPadding = { top: 7, bottom: 2, left: 6, right: 6 };
        } else if (k) {
          d.cell.styles.fontSize = 9;
          d.cell.styles.textColor = MUTED;
          d.cell.styles.cellPadding = { top: 2, bottom: k.last ? 7 : 2, left: 14, right: 6 };
        }
      }
    },
    didDrawCell: (d) => {
      // Rule under each project group (not between a project and its notes).
      const closes = d.section === "body" ? kinds[d.row.index]?.last : false;
      if (closes || d.section === "foot") {
        const { x, y: cy, width, height } = d.cell;
        const ly = cy + (d.section === "foot" ? 0 : height);
        doc.setDrawColor(...RULE).setLineWidth(0.5);
        doc.line(x, ly, x + width, ly);
      }
    },
  });
  // biome-ignore lint/suspicious/noExplicitAny: jspdf-autotable stores the last table position on the doc
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 24;

  // ── How to pay ──────────────────────────────────────────────────────────
  if (s.seller.paymentInstructions?.trim()) {
    const payLines = (doc.splitTextToSize(s.seller.paymentInstructions, pageW - MARGIN * 2) as string[]).slice(0, 12);
    if (y > 700 - payLines.length * 13) {
      doc.addPage();
      y = MARGIN;
    }
    doc
      .setFont("helvetica", "bold")
      .setFontSize(8)
      .setTextColor(...MUTED)
      .text("HOW TO PAY", MARGIN, y);
    doc
      .setFont("helvetica", "normal")
      .setFontSize(10)
      .setTextColor(...INK);
    doc.text(payLines, MARGIN, y + 14);
    y += 14 + payLines.length * 13 + 16;
  }

  // ── Rounding rule (only when one was applied) ───────────────────────────
  if (s.rounding) {
    if (y > 700) {
      doc.addPage();
      y = MARGIN;
    }
    const said = `${describeRounding(s.rounding)}${
      s.loggedMinutes === undefined ? "" : ` Logged: ${formatDecimalHours(s.loggedMinutes)} h.`
    }`;
    doc
      .setFont("helvetica", "italic")
      .setFontSize(9)
      .setTextColor(...MUTED);
    const sayLines = doc.splitTextToSize(said, pageW - MARGIN * 2) as string[];
    doc.text(sayLines, MARGIN, y);
    y += sayLines.length * 12 + 12;
  }

  // ── Notes / payment terms ───────────────────────────────────────────────
  if (s.notes) {
    if (y > 680) {
      doc.addPage();
      y = MARGIN;
    }
    doc
      .setFont("helvetica", "bold")
      .setFontSize(8)
      .setTextColor(...MUTED)
      .text("NOTES", MARGIN, y);
    doc
      .setFont("helvetica", "normal")
      .setFontSize(10)
      .setTextColor(...INK);
    const wrapped = doc.splitTextToSize(s.notes, pageW - MARGIN * 2) as string[];
    doc.text(wrapped, MARGIN, y + 14);
    y += 14 + wrapped.length * 13 + 16;
  }

  // ── Time detail (own page section; auto-paginates) ──────────────────────
  if (s.includeDetail && s.detail.length > 0) {
    if (y > 600) {
      doc.addPage();
      y = MARGIN;
    }
    doc
      .setFont("helvetica", "bold")
      .setFontSize(8)
      .setTextColor(...MUTED)
      .text("TIME DETAIL", MARGIN, y);
    // Project and work note stay as separate columns. An entry logged without a note says so
    // plainly instead of leaving the cell blank.
    autoTable(doc, {
      startY: y + 8,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Date", "Project", "Description", "Hours"]],
      body: s.detail.map((d) => [
        fmtDate(d.date),
        d.project,
        d.note.trim() || "No description",
        formatDecimalHours(d.minutes),
      ]),
      theme: "plain",
      styles: { ...tableStyles, fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 } },
      headStyles: head,
      columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 120 }, 3: { halign: "right", cellWidth: 50 } },
      didParseCell: (d) => {
        if (d.section === "head" && d.column.index === 3) d.cell.styles.halign = "right";
        if (d.section === "body" && d.column.index === 2 && !s.detail[d.row.index]?.note.trim()) {
          d.cell.styles.textColor = MUTED;
          d.cell.styles.fontStyle = "italic";
        }
      },
    });
  }

  // ── Footer: page numbers ────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc
      .setFont("helvetica", "normal")
      .setFontSize(8)
      .setTextColor(...MUTED);
    const footY = doc.internal.pageSize.getHeight() - 24;
    doc.text(`${s.number} · Page ${i} of ${pages}`, pageW / 2, footY, { align: "center" });
  }
  return doc;
}

export async function downloadInvoicePdf(s: InvoiceSnapshot) {
  const doc = await buildInvoicePdf(s);
  doc.save(`${s.number.replace(/[^\w.-]+/g, "_")}.pdf`);
}

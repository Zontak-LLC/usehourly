/**
 * One definition of an email that renders both parts: the HTML a mail app shows and the plain text it falls back to
 * (and that spam filters and screen readers like). Because both come from the same blocks, they cannot say different
 * things. Everything interpolated is HTML-escaped, links must be http(s), and nothing is loaded from elsewhere (no
 * images, fonts or scripts: mail apps block them, and they are how mail gets tracked).
 */
export type EmailBlock =
  | string // a paragraph
  | { heading: string }
  | { quote: string }
  | { rows: [label: string, value: string][] }
  /** Small muted print, e.g. a note under a table. */
  | { small: string }
  /** Figures as small boxes: two per row, one per row on a phone. */
  | { figures: EmailFigure[] }
  /** A table with a header, rows and an optional bold total row; `textCols` leading columns are text, the rest numbers. */
  | { table: EmailTable }
  | { button: { label: string; url: string } };

export type EmailFigure = { label: string; value: string; hint?: string };
/** A row is its cells; a `sub` row (a project under its client) is indented and muted. */
export type EmailTableRow = string[] | { cells: string[]; sub: true };
export type EmailTable = { head: string[]; rows: EmailTableRow[]; total?: string[]; textCols?: number };

const cellsOf = (row: EmailTableRow) => (Array.isArray(row) ? row : row.cells);
const isSub = (row: EmailTableRow) => !Array.isArray(row);

export type EmailSpec = {
  /** The <title> of the HTML (mail apps may show it); the subject is set by the caller. */
  title: string;
  greeting: string;
  blocks: EmailBlock[];
  /** Small print under the card, e.g. why you got this and how to stop it. */
  footnote?: { text: string; link?: { label: string; url: string } };
};

// The calm (v4) palette as fixed colours: mail apps ignore CSS variables. `sun` is the accent (periwinkle).
const C = {
  page: "#eef2f7",
  card: "#ffffff",
  line: "#dbe2ec",
  ink: "#1c2434",
  muted: "#586377",
  sun: "#5a63d8",
  darkPage: "#131a26",
  darkCard: "#1a2232",
  darkLine: "#2a3447",
  darkInk: "#e6ebf3",
  darkMuted: "#9ba7ba",
};

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** The URL if it is an ordinary web address, else null (so `javascript:` and friends never become a link). */
export function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function figuresHtml(figures: EmailFigure[]): string {
  const box = (f: EmailFigure) =>
    `<td class="stat" width="50%" style="padding:4px;vertical-align:top;"><div class="line" style="border:1px solid ${C.line};border-radius:10px;padding:10px 12px;">` +
    `<p class="muted" style="margin:0;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${C.muted};">${escapeHtml(f.label)}</p>` +
    `<p class="fg" style="margin:2px 0 0;font-size:20px;font-weight:700;color:${C.ink};white-space:nowrap;">${escapeHtml(f.value)}</p>` +
    (f.hint
      ? `<p class="muted" style="margin:2px 0 0;font-size:12px;line-height:1.4;color:${C.muted};">${escapeHtml(f.hint)}</p>`
      : "") +
    "</div></td>";
  const rows: string[] = [];
  for (let i = 0; i < figures.length; i += 2) {
    const pair = figures.slice(i, i + 2);
    rows.push(`<tr>${pair.map(box).join("")}${pair.length === 1 ? '<td class="stat" width="50%"></td>' : ""}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">${rows.join("")}</table>`;
}

function tableHtml(t: EmailTable): string {
  const textCols = t.textCols ?? 1;
  const align = (i: number) => (i < textCols ? "text-align:left;" : "text-align:right;white-space:nowrap;");
  const cell = (tag: "th" | "td", value: string, i: number, style: string, cls: string) =>
    `<${tag} class="${cls}" style="padding:6px ${i === 0 ? "8px 6px 0" : "0 6px 8px"};${align(i)}${style}">${escapeHtml(value)}</${tag}>`;
  const head = `<tr>${t.head
    .map((v, i) =>
      cell(
        "th",
        v,
        i,
        `font-weight:600;font-size:12px;color:${C.muted};border-bottom:1px solid ${C.line};`,
        "muted line",
      ),
    )
    .join("")}</tr>`;
  const body = t.rows
    .map((row) => {
      const sub = isSub(row);
      return `<tr>${cellsOf(row)
        .map((v, i) =>
          cell(
            "td",
            v,
            i,
            `color:${sub ? C.muted : C.ink};${sub && i === 0 ? "padding-left:14px;" : ""}${sub ? "" : "font-weight:600;"}border-bottom:1px solid ${C.line};`,
            `${sub ? "muted" : "fg"} line`,
          ),
        )
        .join("")}</tr>`;
    })
    .join("");
  const total = t.total
    ? `<tr>${t.total.map((v, i) => cell("td", v, i, `font-weight:700;color:${C.ink};`, "fg")).join("")}</tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:13px;line-height:1.4;border-collapse:collapse;">${head}${body}${total}</table>`;
}

function blockHtml(block: EmailBlock): string {
  if (typeof block === "string") {
    return `<p class="fg" style="margin:0 0 16px;color:${C.ink};">${escapeHtml(block)}</p>`;
  }
  if ("heading" in block) {
    return `<p class="fg" style="margin:0 0 16px;font-size:18px;font-weight:700;color:${C.ink};">${escapeHtml(block.heading)}</p>`;
  }
  if ("quote" in block) {
    return `<p class="fg quote" style="margin:0 0 16px;padding:8px 14px;border-left:3px solid ${C.sun};color:${C.ink};white-space:pre-wrap;">${escapeHtml(block.quote)}</p>`;
  }
  if ("small" in block) {
    return `<p class="muted" style="margin:-8px 0 16px;font-size:13px;color:${C.muted};">${escapeHtml(block.small)}</p>`;
  }
  if ("figures" in block) return figuresHtml(block.figures);
  if ("table" in block) return tableHtml(block.table);
  if ("rows" in block) {
    const rows = block.rows
      .map(
        ([label, value]) =>
          `<tr><td class="muted" style="padding:4px 16px 4px 0;color:${C.muted};white-space:nowrap;">${escapeHtml(label)}</td><td class="fg" style="padding:4px 0;color:${C.ink};">${escapeHtml(value)}</td></tr>`,
      )
      .join("");
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:15px;">${rows}</table>`;
  }
  const href = safeUrl(block.button.url);
  // A link that is not a web address is shown as plain text, never as something to click.
  if (!href) return `<p class="fg" style="margin:0 0 16px;color:${C.ink};">${escapeHtml(block.button.url)}</p>`;
  return (
    `<p style="margin:0 0 8px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${C.sun};color:white;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px;">${escapeHtml(block.button.label)}</a></p>` +
    `<p class="muted" style="margin:0 0 16px;font-size:13px;color:${C.muted};word-break:break-all;">Or paste this link into your browser: ${escapeHtml(href)}</p>`
  );
}

/** A table as aligned plain text: text columns padded on the right, numbers on the left, so the figures line up. */
function tableText(t: EmailTable): string {
  const textCols = t.textCols ?? 1;
  const lines = [
    t.head,
    ...t.rows.map((r) => (isSub(r) ? cellsOf(r).map((v, i) => (i === 0 ? `  ${v}` : v)) : cellsOf(r))),
    ...(t.total ? [t.total] : []),
  ];
  const widths = t.head.map((_, i) => Math.max(...lines.map((l) => (l[i] ?? "").length)));
  return lines
    .map((l) =>
      `  ${l.map((v, i) => (i < textCols ? (v ?? "").padEnd(widths[i]) : (v ?? "").padStart(widths[i]))).join("  ")}`.trimEnd(),
    )
    .join("\n");
}

function blockText(block: EmailBlock): string {
  if (typeof block === "string") return block;
  if ("small" in block) return block.small;
  if ("figures" in block) {
    return block.figures.map((f) => `  ${f.label.padEnd(15)} ${f.value}${f.hint ? `  (${f.hint})` : ""}`).join("\n");
  }
  if ("table" in block) return tableText(block.table);
  if ("heading" in block) return block.heading;
  if ("quote" in block) return `"${block.quote}"`;
  if ("rows" in block) return block.rows.map(([label, value]) => `  ${label.padEnd(13)} ${value}`).join("\n");
  return block.button.url;
}

export function renderEmail(spec: EmailSpec): { html: string; text: string } {
  const text = [spec.greeting, ...spec.blocks.map(blockText), "UseHourly"].join("\n\n");
  const note = spec.footnote;
  const noteText = note ? `\n\n${note.text}${note.link ? ` ${note.link.label}: ${note.link.url}` : ""}` : "";

  const noteLink = note?.link && safeUrl(note.link.url);
  const noteHtml = note
    ? `<p class="muted" style="margin:16px 0 0;font-size:13px;color:${C.muted};">${escapeHtml(note.text)}${
        note.link && noteLink
          ? ` <a href="${escapeHtml(noteLink)}" style="color:${C.muted};text-decoration:underline;">${escapeHtml(note.link.label)}</a>`
          : ""
      }</p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(spec.title)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .page { background: ${C.darkPage} !important; }
  .card { background: ${C.darkCard} !important; border-color: ${C.darkLine} !important; }
  .fg { color: ${C.darkInk} !important; }
  .muted { color: ${C.darkMuted} !important; }
  .line { border-color: ${C.darkLine} !important; }
}
@media (max-width: 520px) {
  .stat { display: block !important; width: 100% !important; box-sizing: border-box; }
}
</style>
</head>
<body class="page" style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="page" style="background:${C.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:12px;">
<tr><td style="padding:28px;font-family:${FONT};font-size:16px;line-height:1.55;">
<p class="fg" style="margin:0 0 20px;font-size:14px;font-weight:700;letter-spacing:.02em;color:${C.ink};">UseHourly</p>
<p class="fg" style="margin:0 0 16px;color:${C.ink};">${escapeHtml(spec.greeting)}</p>
${spec.blocks.map(blockHtml).join("\n")}
<p class="muted" style="margin:8px 0 0;font-size:13px;color:${C.muted};">UseHourly: simple time tracking for freelancers</p>
${noteHtml}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { html, text: `${text}${noteText}` };
}

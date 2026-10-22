import { CardTitle } from "@/components/card-title";
import { CollapsibleSection } from "@/components/collapsible-section";

/** One line of the summary: the label (with a muted hint under it) on the left, the figure on the right. */
export function SummaryRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t px-4 py-2.5 first:border-t-0">
      <dt className="min-w-0 text-sm">
        {label}
        {hint && <span className="block text-muted-foreground text-xs">{hint}</span>}
      </dt>
      <dd className="shrink-0 font-mono font-semibold text-base tabular-nums">{value}</dd>
    </div>
  );
}

/** A section of the year summary. `foldId` makes it fold (with `summary` shown while folded); without it it is plain. */
export function Section({
  title,
  note,
  foldId,
  summary,
  defaultOpen,
  children,
}: {
  title: string;
  note?: string;
  foldId?: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  if (foldId) {
    return (
      <CollapsibleSection id={`report:${foldId}`} title={title} note={note} summary={summary} defaultOpen={defaultOpen}>
        {children}
      </CollapsibleSection>
    );
  }
  return (
    <section aria-label={title} className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b bg-band-2 px-4 py-3">
        <CardTitle title={title} note={note} />
      </div>
      {children}
    </section>
  );
}

/** `textCols` = how many leading columns are text (left-aligned); the rest are numbers. */
export function Table({
  head,
  rows,
  total,
  textCols = 1,
  phoneSummary,
}: {
  head: string[];
  rows: string[][];
  total?: string[];
  textCols?: number;
  /**
   * Phones: a compact two-line row instead of a label/value list per row. `valueIndex` is the figure shown big on the
   * right (Earned); `detail` writes the rest in one muted line. Without it the full list is used.
   */
  phoneSummary?: { valueIndex: number; detail: (row: string[]) => string };
}) {
  const align = (i: number) => (i < textCols ? "" : "text-right font-mono tabular-nums");
  return (
    <>
      {/* Phones: one small card per row, with a label beside each value. */}
      <ul className="divide-y sm:hidden">
        {phoneSummary &&
          [...rows, ...(total ? [total] : [])].map((r) => (
            <li
              key={r[0]}
              className={`flex items-baseline justify-between gap-3 px-4 py-2.5 ${r === total ? "bg-muted/40" : ""}`}
            >
              <div className="min-w-0">
                <p className="font-medium">{r[0]}</p>
                <p className="text-muted-foreground text-xs">{phoneSummary.detail(r)}</p>
              </div>
              <p className="shrink-0 font-medium font-mono tabular-nums">{r[phoneSummary.valueIndex]}</p>
            </li>
          ))}
        {!phoneSummary &&
          rows.map((r) => (
            <li key={r.join("|")} className="px-4 py-3">
              <p className="font-medium">{r[0]}</p>
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {r.slice(1).map((c, k) => (
                  <div key={`${r[0]}-${head[k + 1]}`} className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">{head[k + 1]}</dt>
                    <dd className={k + 1 < textCols ? "text-right" : "text-right font-mono tabular-nums"}>{c}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        {!phoneSummary && total && (
          <li className="bg-muted/40 px-4 py-3">
            <p className="font-medium">{total[0]}</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {total.slice(1).map((c, k) =>
                c ? (
                  <div key={`t-${head[k + 1]}`} className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">{head[k + 1]}</dt>
                    <dd className="text-right font-medium font-mono tabular-nums">{c}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </li>
        )}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {head.map((c, i) => (
                <th key={c} className={`px-4 py-2 font-normal ${i < textCols ? "" : "text-right"}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.join("|")} className="border-b last:border-0">
                {r.map((c, i) => (
                  <td key={`${r[0]}-${head[i]}`} className={`px-4 py-2 ${align(i)}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot>
              <tr className="border-t bg-muted/40 font-medium">
                {total.map((c, i) => (
                  <td key={`t-${head[i]}`} className={`px-4 py-2 ${align(i)}`}>
                    {c}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

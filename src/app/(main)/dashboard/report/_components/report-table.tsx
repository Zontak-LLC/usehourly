import { CardTitle } from "@/components/card-title";

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-mono font-semibold text-lg tabular-nums sm:text-xl">{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

export function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
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
}: {
  head: string[];
  rows: string[][];
  total?: string[];
  textCols?: number;
}) {
  const align = (i: number) => (i < textCols ? "" : "text-right font-mono tabular-nums");
  return (
    <>
      {/* Phones: one small card per row, with a label beside each value. */}
      <ul className="divide-y sm:hidden">
        {rows.map((r) => (
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
        {total && (
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

"use client";

/**
 * Where details land on an invoice (2026-10-23): a small sheet of paper, slightly tilted and dimmed in dark mode, drawn
 * mostly as quiet lines. Only the parts a form fills in are real text, marked with a thin amber edge, and they follow
 * the typing. Clients' Billing details pass `billTo`; Account's Business details pass `seller` and `pay`.
 */

const LINE = "h-2 rounded-full bg-[rgb(20_22_27/0.12)]";
const MARK = "rounded-r-sm border-amber border-l-2 bg-[rgb(245_165_36/0.12)] py-1.5 pr-1.5 pl-2";

function Lines({ widths }: { widths: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      {widths.map((w) => (
        <span key={w} className={LINE} style={{ width: w }} />
      ))}
    </div>
  );
}

export function InvoiceSketch({
  seller,
  billTo,
  pay,
}: {
  /** Your side, at the top: logo, name, address, tax ID. */
  seller?: { logo?: string | null; name: string; address?: string; ein?: string };
  /** The client's block. */
  billTo?: { logo?: string | null; name: string; address?: string };
  /** How to pay, at the foot. */
  pay?: string;
}) {
  return (
    <figure aria-hidden className="mx-auto w-full max-w-[22rem]">
      <div className="-rotate-[1.5deg] rounded-md bg-[rgb(250_249_246)] p-4 text-[10px] text-[rgb(20_22_27)] leading-snug shadow-[0_18px_40px_-18px_rgb(0_0_0/0.6)] transition-transform duration-300 hover:rotate-0 dark:brightness-[0.82]">
        {/* Top: your side and the word INVOICE. */}
        <div className="flex items-start justify-between gap-2">
          {seller ? (
            <div className={`min-w-0 flex-1 ${MARK}`}>
              {seller.logo && (
                // biome-ignore lint/performance/noImgElement: a small data URL logo
                <img src={seller.logo} alt="" className="mb-1 h-8 max-w-28 object-contain object-left" />
              )}
              <p className="break-words font-semibold">{seller.name}</p>
              {seller.address && <p className="line-clamp-3 whitespace-pre-line break-words">{seller.address}</p>}
              {seller.ein && <p className="font-mono opacity-70">EIN {seller.ein}</p>}
            </div>
          ) : (
            <div className="w-20">
              <Lines widths={["100%", "75%"]} />
            </div>
          )}
          <span className="shrink-0 font-semibold text-[11px] tracking-[0.2em] opacity-60">INVOICE</span>
        </div>

        {/* The client's block. */}
        <div className="mt-4">
          {billTo ? (
            <div className={`flex items-start justify-between gap-2 ${MARK}`}>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider opacity-55">Bill to</p>
                <p className="break-words font-semibold">{billTo.name}</p>
                {billTo.address && <p className="line-clamp-4 whitespace-pre-line break-words">{billTo.address}</p>}
              </div>
              {billTo.logo && (
                // biome-ignore lint/performance/noImgElement: a small data URL logo
                <img src={billTo.logo} alt="" className="h-8 w-14 shrink-0 object-contain" />
              )}
            </div>
          ) : (
            <div className="w-24">
              <p className="mb-1 text-[10px] uppercase tracking-wider opacity-45">Bill to</p>
              <Lines widths={["100%", "70%"]} />
            </div>
          )}
        </div>

        {/* The lines and the total: from your time, so only drawn. */}
        <div className="mt-4 flex flex-col gap-1.5">
          {["54%", "42%", "48%"].map((w) => (
            <div key={w} className="flex items-center justify-between gap-3">
              <span className={LINE} style={{ width: w }} />
              <span className={`${LINE} w-8`} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end border-[rgb(20_22_27/0.12)] border-t pt-2">
          <span className="h-2 w-14 rounded-full bg-[rgb(20_22_27/0.3)]" />
        </div>

        {/* How to pay. */}
        {pay !== undefined && (
          <div className={`mt-3 ${pay.trim() ? MARK : ""}`}>
            <p className="text-[10px] uppercase tracking-wider opacity-55">How to pay</p>
            {pay.trim() ? (
              <p className="line-clamp-4 whitespace-pre-line break-words">{pay.trim()}</p>
            ) : (
              <p className="opacity-50">Nothing printed</p>
            )}
          </div>
        )}
      </div>
      <figcaption className="mt-3 text-center text-foreground/70 text-sm">Where this goes on the invoice</figcaption>
    </figure>
  );
}

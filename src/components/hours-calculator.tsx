"use client";

import { useState } from "react";

import { readLines, summarize } from "@/lib/hours-calc";
import { formatMoney } from "@/lib/money";

export function HoursCalculator() {
  const [text, setText] = useState("1:30\n2h\n45m\n1.25");
  const [rate, setRate] = useState("");
  const lines = readLines(text);
  const rateNum = rate.trim() === "" || Number.isNaN(Number(rate)) ? null : Number(rate);
  const total = summarize(lines, rateNum);

  return (
    <div className="grid gap-6 rounded-xl border bg-card p-5 sm:grid-cols-2">
      <div className="space-y-2">
        <label htmlFor="hc-times" className="font-medium text-sm">
          One time per line
        </label>
        <textarea
          id="hc-times"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="w-full rounded-md border bg-card p-3 font-mono text-base"
          placeholder={"1:30\n2h\n45m\n1.5"}
        />
        <label htmlFor="hc-rate" className="block font-medium text-sm">
          Hourly rate (optional, USD)
        </label>
        <input
          id="hc-rate"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className="h-11 w-full rounded-md border bg-card px-3 text-base"
          placeholder="85"
        />
      </div>
      <div className="space-y-3" aria-live="polite">
        <p className="text-muted-foreground text-sm">Total</p>
        <p className="font-semibold text-4xl tabular-nums">{total.decimal} hours</p>
        <p className="text-lg tabular-nums">{total.clock} (hours:minutes)</p>
        {total.amountCents !== null && (
          <p className="text-lg tabular-nums">Amount: {formatMoney(total.amountCents, "USD")}</p>
        )}
        {total.unreadable > 0 && (
          <p className="text-destructive text-sm">
            {total.unreadable} line{total.unreadable === 1 ? "" : "s"} couldn't be read and{" "}
            {total.unreadable === 1 ? "was" : "were"} left out.
          </p>
        )}
      </div>
    </div>
  );
}

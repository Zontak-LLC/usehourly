"use client";

import { createContext, type ReactNode, useCallback, useContext } from "react";

import { currencyOrDefault, DEFAULT_CURRENCY, formatMoney } from "@/lib/money";

const CurrencyContext = createContext<string>(DEFAULT_CURRENCY);

/** The signed-in account's currency (read on the server in the dashboard layout), for every screen that shows money. */
export function CurrencyProvider({ currency, children }: { currency: string; children: ReactNode }) {
  return <CurrencyContext.Provider value={currencyOrDefault(currency)}>{children}</CurrencyContext.Provider>;
}

export const useCurrency = () => useContext(CurrencyContext);

/** `money(cents)` written in the account's currency: "$1,234.50", "€1,234.50". */
export function useMoney() {
  const currency = useCurrency();
  return useCallback((cents: number) => formatMoney(cents, currency), [currency]);
}

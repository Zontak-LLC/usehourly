"use client";

import { createContext, type ReactNode, useCallback, useContext } from "react";

import { currencyOrDefault, DEFAULT_CURRENCY, effectiveCurrency, formatMoney } from "@/lib/money";

type CurrencyState = { currency: string; account: string };
const CurrencyContext = createContext<CurrencyState>({ currency: DEFAULT_CURRENCY, account: DEFAULT_CURRENCY });

/** The signed-in account's currency (read on the server in the dashboard layout), for every screen that shows money. */
export function CurrencyProvider({ currency, children }: { currency: string; children: ReactNode }) {
  const code = currencyOrDefault(currency);
  return <CurrencyContext.Provider value={{ currency: code, account: code }}>{children}</CurrencyContext.Provider>;
}

/**
 * Everything inside is one client's money, written in that client's currency (its own, else the account's; issue #71
 * step 2). The account's currency stays available to `useAccountCurrency`, so these can sit next to each other.
 */
export function ClientCurrency({ currency, children }: { currency: string | null | undefined; children: ReactNode }) {
  const { account } = useContext(CurrencyContext);
  return (
    <CurrencyContext.Provider value={{ currency: effectiveCurrency(currency, account), account }}>
      {children}
    </CurrencyContext.Provider>
  );
}

/** The currency amounts are written in here: the client's inside `ClientCurrency`, else the account's. */
export const useCurrency = () => useContext(CurrencyContext).currency;

/** The account's own (default) currency, whatever client is being shown. */
export const useAccountCurrency = () => useContext(CurrencyContext).account;

/** `money(cents)` written in the current currency: "$1,234.50", "€1,234.50". */
export function useMoney() {
  const currency = useCurrency();
  return useCallback((cents: number) => formatMoney(cents, currency), [currency]);
}

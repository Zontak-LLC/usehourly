"use client";

import { useEffect, useState } from "react";

export type InvoiceStatusFilter = "all" | "unpaid" | "paid";
export type InvoiceSort = "newest" | "oldest" | "highest" | "lowest";

/** The search box and filters of the Invoices page, plus the query input they add up to. */
export function useInvoiceFilters() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<InvoiceStatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<InvoiceSort>("newest");
  // Debounce so each keystroke isn't a server query.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  return {
    text,
    setText,
    clientId,
    setClientId,
    status,
    setStatus,
    from,
    setFrom,
    to,
    setTo,
    sort,
    setSort,
    clearSearch() {
      setText("");
      setQ("");
    },
    clearAll() {
      setText("");
      setQ("");
      setClientId("");
      setStatus("all");
      setFrom("");
      setTo("");
      setSort("newest");
    },
    listInput: {
      q: q || undefined,
      clientId: clientId || undefined,
      status: status === "all" ? undefined : status,
      from: from || undefined,
      to: to || undefined,
      sort: sort === "newest" ? undefined : sort,
    },
    activeFilters: [clientId, status !== "all", sort !== "newest", from, to].filter(Boolean).length,
    filtering: !!q || !!clientId || status !== "all" || !!from || !!to,
  };
}

export type InvoiceFilters = ReturnType<typeof useInvoiceFilters>;

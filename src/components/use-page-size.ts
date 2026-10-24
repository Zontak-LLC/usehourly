"use client";

import { useEffect, useState } from "react";

import { PAGE_SIZE_DESKTOP, PAGE_SIZE_PHONE } from "@/lib/paginate";

/**
 * Items per page for the screen in hand: `phone` under 640px (the phone layout, 3 by default), 10 above. Follows a rotated
 * phone. Week's By project passes Infinity: a phone scrolls the whole list, pages are for the capped desktop card.
 */
export function usePageSize(phone: number = PAGE_SIZE_PHONE): number {
  const [size, setSize] = useState(PAGE_SIZE_DESKTOP);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setSize(query.matches ? phone : PAGE_SIZE_DESKTOP);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [phone]);
  return size;
}

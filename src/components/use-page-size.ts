"use client";

import { useEffect, useState } from "react";

import { PAGE_SIZE_DESKTOP, PAGE_SIZE_PHONE } from "@/lib/paginate";

/** Items per page for the screen in hand: 3 under 640px (the phone layout), 10 above. Follows a rotated phone. */
export function usePageSize(): number {
  const [size, setSize] = useState(PAGE_SIZE_DESKTOP);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setSize(query.matches ? PAGE_SIZE_PHONE : PAGE_SIZE_DESKTOP);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return size;
}

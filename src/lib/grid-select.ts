/** A mouse drag over the calendar grid, in (row, column) cell coordinates. */
export type GridDrag = { r0: number; c0: number; r1: number; c1: number };

/**
 * The days inside the dragged rectangle (like a spreadsheet block), limited to days for which
 * `selectable` is true — the month's own days, not the grey padding days from neighbouring months.
 */
export function rectDays(weeks: string[][], drag: GridDrag, selectable: (day: string) => boolean): Set<string> {
  const out = new Set<string>();
  for (let r = Math.min(drag.r0, drag.r1); r <= Math.max(drag.r0, drag.r1); r++) {
    for (let c = Math.min(drag.c0, drag.c1); c <= Math.max(drag.c0, drag.c1); c++) {
      const day = weeks[r]?.[c];
      if (day && selectable(day)) out.add(day);
    }
  }
  return out;
}

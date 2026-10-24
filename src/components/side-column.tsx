import type { ReactNode } from "react";

/**
 * The side column of a two-column page (Week's "This week" card, Month's calendar). From 768px the card is min(its own
 * content, the main column): a card shorter than the main column keeps its own height (no empty block under it); a
 * longer one stops at the main column's foot and only its list scrolls (`SideScroll`). The box never gets shorter than
 * 24rem, so a short main column cannot leave a tiny scroll box. On a phone the columns stack and nothing changes. Pure
 * CSS: the cell stretches with the grid row and its content sits absolutely inside it (so the content's height does not
 * count toward the row), and the card is `max-h-full` of that box.
 *
 * The card inside takes `SIDE_CARD` and wraps its rows in `SideScroll`; its header stays put.
 */
export function SideColumn({ children, inFlow = false }: { children: ReactNode; inFlow?: boolean }) {
  return (
    <div data-side-column className={`relative min-w-0 md:self-stretch ${inFlow ? "" : "md:min-h-96"}`}>
      {/* `inFlow` (Month's calendar): the content counts toward the row's height, so a short right column never cuts it
          off; the card is still sticky inside the stretched cell. */}
      <div className={`flex flex-col gap-4 ${inFlow ? "md:h-full" : "md:absolute md:inset-0"}`}>{children}</div>
    </div>
  );
}

/**
 * The card's classes: its own height, capped at the side column's (it never stretches into an empty block). When it is
 * shorter than the column it is sticky, so it stays in view (under the top bar, 6rem) while the main column scrolls;
 * capped, sticky has no room to move and does nothing. It is also never taller than the window under the top bar
 * (2026-10-24, the owner: a 1,000px card on a 900px laptop hid its last rows).
 */
export const SIDE_CARD = "flex flex-col md:sticky md:top-24 md:max-h-[min(100%,calc(100dvh-7rem))] md:min-h-0";

/** The rows of a side card: they scroll inside the card from 768px, with a soft fade at an edge that has more and no
 * scrollbar (the owner, 2026-10-24: the fade says there is more; wheel, trackpad, touch and keyboard still scroll). */
export function SideScroll({ children }: { children: ReactNode }) {
  return (
    <div
      data-side-scroll
      className="side-scroll min-h-0 [scrollbar-width:none] md:flex-auto md:overflow-y-auto md:overscroll-contain [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}

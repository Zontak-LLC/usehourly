import { expect, test } from "./helpers";

/**
 * The home page lines up (issue 252): every framed block (header, the feature tiles, the promises, the closing panel,
 * the footer) shares one left and one right edge; the terminal and the screens deck share one narrower, centred width;
 * the deck's caption sits above its window, with no "1 / 6" counter, and the arrows sit below it with the dots.
 */
test("the home page's blocks share their edges, and the deck reads top to bottom", async ({ page, isMobile }) => {
  await page.goto("/");
  // `inside`: the content edge, inside the side padding (a header or footer row); a panel is measured at its outer edge.
  const box = (selector: string, inside = true) =>
    page
      .locator(selector)
      .first()
      .evaluate((el, inner) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const pl = inner ? Number.parseFloat(s.paddingLeft) : 0;
        const pr = inner ? Number.parseFloat(s.paddingRight) : 0;
        return { left: r.left + pl, right: r.right - pr };
      }, inside);

  await test.step("framed blocks share one left and one right edge", async () => {
    const frames = [
      await box("header"),
      await box("#features ul"),
      await box('section[aria-labelledby="promises-heading"] ul'),
      await box('section[aria-labelledby="start-heading"] > *', false),
      await box("footer"),
    ];
    for (const f of frames.slice(1)) {
      expect(Math.abs(f.left - (frames[0]?.left ?? 0))).toBeLessThan(2);
      expect(Math.abs(f.right - (frames[0]?.right ?? 0))).toBeLessThan(2);
    }
  });

  await test.step("the terminal and the deck have one width, centred", async () => {
    const terminal = await box("#ai-assistants");
    const deck = await page
      .getByRole("tabpanel")
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      });
    expect(Math.abs(terminal.left - deck.left)).toBeLessThan(2);
    expect(Math.abs(terminal.right - deck.right)).toBeLessThan(2);
    if (!isMobile) expect(Math.round(deck.right - deck.left)).toBe(896); // max-w-4xl: narrower than the framed blocks
  });

  await test.step("the caption is above the window, the arrows below it, and there is no counter", async () => {
    const deck = page.getByRole("region", { name: "Screens of the app" });
    await expect(deck).not.toContainText(/\d\s*\/\s*6\b/);
    const window = await deck.getByRole("tabpanel").boundingBox();
    const caption = await deck.getByRole("heading", { name: "Log a day in seconds" }).boundingBox();
    const next = await deck.getByRole("button", { name: "Next screen" }).boundingBox();
    expect(caption && window && caption.y + caption.height <= window.y).toBe(true);
    expect(next && window && next.y >= window.y + window.height).toBe(true);
    const dot = await deck.getByRole("button", { name: "Show the Week screen" }).boundingBox();
    expect(dot && next && Math.abs(dot.y + dot.height / 2 - (next.y + next.height / 2)) < 4).toBe(true); // one row
  });
});

import { createElement } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/toast-error";

import { mount } from "./helpers/hook-runtime";

// The Button's delay hook runs on the small stand-in for useState and useEffect (node has no DOM to mount into);
// the markup is React's own server render of the real Button and Spinner.
vi.mock("react", async (real) => ({
  ...(await real<object>()),
  ...(await import("./helpers/hook-runtime")).hookRuntime,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

/** A busy Save, written the way callers write it: their own words, the shared busy state. */
function saveButton() {
  return mount(
    (p: { pending: boolean }) =>
      renderToStaticMarkup(
        createElement(
          Button,
          { variant: "primary", busy: p.pending, busyLabel: "Saving" },
          p.pending ? "Saving…" : "Save",
        ),
      ),
    { pending: false },
  );
}

/** Presses Save: a mocked mutation answers (or fails) after `ms`; a failure goes to the caller's toast as in the app. */
function press(view: ReturnType<typeof saveButton>, ms: number, fails = false) {
  view.rerender({ pending: true });
  const mutation = new Promise((resolve, reject) =>
    setTimeout(() => (fails ? reject(new Error("Couldn't reach the server.")) : resolve("ok")), ms),
  );
  return mutation
    .catch((err) => toastError(err, "Couldn't save changes."))
    .finally(() => view.rerender({ pending: false }));
}

const status = /role="status" aria-label="Saving"/;
/** The disabled attribute (the class list also holds the word "disabled", in `disabled:opacity-50`). */
const off = 'disabled=""';
/** The attribute the button sets while its spinner shows (the class list names data-busy too, in its CSS rule). */
const busyAttr = 'data-busy="true"';

describe("A busy button: off at once, a spinner only on a slow save (issue 430)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("a slow save: off and busy at once, the spinner after 300 ms, back to normal after the answer", async () => {
    const view = saveButton();
    expect(view.value).not.toContain(off);
    const done = press(view, 500);

    expect(view.value).toContain('disabled=""');
    expect(view.value).toContain('aria-busy="true"');
    expect(view.value).not.toMatch(status);

    await vi.advanceTimersByTimeAsync(300);
    expect(view.value).toMatch(status);
    expect(view.value).toContain("Saving…");
    // The spinner comes before the words.
    expect(view.value.indexOf('role="status"')).toBeLessThan(view.value.indexOf("Saving…"));

    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(view.value).not.toContain(off);
    expect(view.value).not.toContain("aria-busy");
    expect(view.value).not.toContain('role="status"');
    expect(view.value).toContain(">Save</button>");
  });

  it("a fast save (100 ms) never shows the spinner", async () => {
    const view = saveButton();
    const seen: string[] = [];
    const done = press(view, 100);
    for (let ms = 0; ms < 1000; ms += 10) {
      seen.push(view.value);
      await vi.advanceTimersByTimeAsync(10);
    }
    await done;
    expect(seen.some((html) => html.includes('aria-busy="true"'))).toBe(true);
    expect(seen.some((html) => status.test(html))).toBe(false);
    expect(view.value).not.toContain(off);
  });

  it("a failed save: the spinner goes, the button is back, and the message shows (never silent)", async () => {
    const view = saveButton();
    const done = press(view, 800, true);
    await vi.advanceTimersByTimeAsync(400);
    expect(view.value).toMatch(status);

    await vi.advanceTimersByTimeAsync(400);
    await done;
    expect(view.value).not.toContain('role="status"');
    expect(view.value).not.toContain(off);
    expect(toast.error).toHaveBeenCalledWith("Couldn't reach the server.");
  });

  it("the caller's icon stays until the spinner shows, so a fast export never makes it vanish", async () => {
    const view = mount(
      (p: { pending: boolean }) =>
        renderToStaticMarkup(
          createElement(
            Button,
            { busy: p.pending, busyLabel: "Exporting" },
            createElement("svg", { "data-icon": "download" }),
            "Export Excel",
          ),
        ),
      { pending: false },
    );
    view.rerender({ pending: true });
    await vi.advanceTimersByTimeAsync(299);
    expect(view.value).toContain('data-icon="download"');
    expect(view.value).not.toContain(busyAttr);

    // Once the spinner shows, the button hides its own icon (a CSS rule on data-busy), so the width stays the same.
    await vi.advanceTimersByTimeAsync(1);
    expect(view.value).toContain(busyAttr);
    expect(view.value).toContain("[&amp;[data-busy]&gt;svg]:hidden");
    view.rerender({ pending: false });
    expect(view.value).not.toContain(busyAttr);
  });

  it("a link styled as a button (asChild) keeps its one child", () => {
    const view = mount(
      () => renderToStaticMarkup(createElement(Button, { asChild: true }, createElement("a", { href: "/x" }, "Go"))),
      {},
    );
    expect(view.value).toMatch(/^<a /);
    expect(view.value).not.toContain(off);
  });
});

import { createElement } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Spinner } from "@/components/ui/spinner";

const html = (props: Parameters<typeof Spinner>[0] = {}) => renderToStaticMarkup(createElement(Spinner, props));

describe("Spinner: the one loading sign (issue 430)", () => {
  it("with a label is a status named by it", () => {
    const out = html({ label: "Saving" });
    expect(out).toMatch(/^<span role="status" aria-label="Saving" data-slot="spinner"/);
    expect(out).not.toContain('aria-hidden="true" data-slot');
  });

  it("without a label is hidden from screen readers, so a button around it keeps its own name", () => {
    const out = html();
    expect(out).toMatch(/^<span aria-hidden="true" data-slot="spinner"/);
    expect(out).not.toContain('role="status"');
    expect(out).not.toContain("aria-label");
  });

  it("has 12 still spokes, each a step of 1/12 s later in the wave", () => {
    const out = html({ label: "Saving" });
    expect(out.match(/data-spinner-dash/g)).toHaveLength(12);
    const delays = [...out.matchAll(/animation-delay:(-[\d.]+)s/g)].map((m) => Number(m[1]));
    expect(new Set(delays.map((d) => d.toFixed(3))).size).toBe(12);
    expect(Math.min(...delays)).toBeCloseTo(-11 / 12, 3);
    expect(out).toContain("animate-[spinner-fade_1s_linear_infinite]");
  });

  it("runs only when motion is allowed (reduced motion shows a still picture)", () => {
    const out = html();
    const animationClasses = out.match(/[\w:-]*animate-[^\s"]*/g) ?? [];
    expect(animationClasses).toHaveLength(12);
    for (const name of animationClasses) expect(name).toMatch(/^motion-safe:animate-/);
  });

  it("gives each size its own box: sm 16 px, md 20 px, lg 32 px", () => {
    const boxes = (["sm", "md", "lg"] as const).map((size) => html({ size }).match(/size-\d+/)?.[0]);
    expect(boxes).toEqual(["size-4", "size-5", "size-8"]);
    expect(html().match(/size-\d+/)?.[0]).toBe("size-5"); // md by default
  });

  it("takes the text colour, so it fits light, dark and the amber fill", () => {
    const out = html();
    expect(out).toContain("text-current");
    expect(out).toContain("bg-current");
    expect(out).toContain("currentColor_25%");
    expect(out).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

import { createElement } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Spinner } from "@/components/ui/spinner";

const html = (props: Parameters<typeof Spinner>[0] = {}) => renderToStaticMarkup(createElement(Spinner, props));

describe("Spinner: the one loading sign (issue 430)", () => {
  it("is a status named Loading by default, or the action it waits for", () => {
    expect(html()).toMatch(/^<span role="status" aria-label="Loading"/);
    expect(html({ label: "Saving" })).toContain('role="status" aria-label="Saving"');
  });

  it("has 12 still dashes, each a step of 1/12 s later in the wave", () => {
    const out = html();
    expect(out.match(/data-spinner-dash/g)).toHaveLength(12);
    const delays = [...out.matchAll(/animation-delay:(-[\d.]+)s/g)].map((m) => Number(m[1]));
    expect(new Set(delays.map((d) => d.toFixed(3))).size).toBe(12);
    expect(Math.min(...delays)).toBeCloseTo(-11 / 12, 3);
    expect(out).toContain("animate-[spinner-dash_1s_linear_infinite]");
  });

  it("runs only when motion is allowed (reduced motion shows a still picture)", () => {
    const out = html();
    expect(out).not.toMatch(/(?<!motion-safe:)animate-\[/);
    expect(out).toContain("motion-safe:animate-[spinner-dash");
  });

  it("gives each size its own box", () => {
    const boxes = (["sm", "md", "lg"] as const).map((size) => html({ size }).match(/size-\d+/)?.[0]);
    expect(boxes).toEqual(["size-4", "size-6", "size-10"]);
  });

  it("takes the text colour, so it fits light, dark and the amber fill", () => {
    const out = html();
    expect(out).toContain("text-current");
    expect(out).toContain("bg-current");
    expect(out).toContain("currentColor_25%");
    expect(out).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

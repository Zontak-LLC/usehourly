import { describe, expect, it } from "vitest";

import { readFolded } from "@/lib/folded-sections";

describe("folded sections: what the person chose is read back safely", () => {
  it("reads open and closed choices by section id", () => {
    expect(readFolded('{"report:quarters":false,"report:months":true}')).toEqual({
      "report:quarters": false,
      "report:months": true,
    });
  });

  it("ignores anything that is not a true or false choice", () => {
    expect(readFolded('{"a":false,"b":"no","c":1,"d":null}')).toEqual({ a: false });
  });

  it("treats damaged, empty or wrongly shaped storage as no choices (every section follows its default)", () => {
    expect(readFolded(null)).toEqual({});
    expect(readFolded("not json")).toEqual({});
    expect(readFolded("[true,false]")).toEqual({});
    expect(readFolded("7")).toEqual({});
  });
});

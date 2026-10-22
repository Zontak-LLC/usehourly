import { describe, expect, it } from "vitest";

import { previousVersionId } from "../../scripts/rollback-previous.mjs";

const d = (version: string, at: string) => ({ created_on: at, versions: [{ version_id: version, percentage: 100 }] });

describe("which version an automatic rollback goes back to", () => {
  it("is the version live before the newest deployment", () => {
    const list = [d("v1", "2026-10-21T10:00:00Z"), d("v2", "2026-10-21T12:00:00Z"), d("v3", "2026-10-22T09:00:00Z")];
    expect(previousVersionId(list)).toBe("v2");
  });

  it("does not depend on the order the list comes in", () => {
    const list = [d("v3", "2026-10-22T09:00:00Z"), d("v1", "2026-10-21T10:00:00Z"), d("v2", "2026-10-21T12:00:00Z")];
    expect(previousVersionId(list)).toBe("v2");
  });

  it("skips earlier deployments of the very same version (a re-deploy)", () => {
    const list = [d("v1", "2026-10-21T10:00:00Z"), d("v2", "2026-10-21T12:00:00Z"), d("v2", "2026-10-22T09:00:00Z")];
    expect(previousVersionId(list)).toBe("v1");
  });

  it("is null when there is nothing earlier, and ignores junk entries", () => {
    expect(previousVersionId([d("v1", "2026-10-21T10:00:00Z")])).toBeNull();
    expect(previousVersionId([])).toBeNull();
    expect(previousVersionId([{ created_on: "x" }, null, d("v1", "2026-10-21T10:00:00Z")])).toBeNull();
    expect(previousVersionId([d("v1", "2026-10-21T10:00:00Z"), d("v1", "2026-10-22T09:00:00Z")])).toBeNull();
  });
});

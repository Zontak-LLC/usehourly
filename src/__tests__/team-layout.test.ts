import { describe, expect, it } from "vitest";

import { inviteSlotShape } from "@/lib/team-layout";

describe("where the Invite someone card goes on the Team page", () => {
  it("is the big empty-state card with nobody, spans the row when the people fill whole rows, and sits beside the last person otherwise", () => {
    expect(inviteSlotShape(0)).toBe("empty-state");
    expect(inviteSlotShape(1)).toBe("beside");
    expect(inviteSlotShape(2)).toBe("wide");
    expect(inviteSlotShape(3)).toBe("beside");
    expect(inviteSlotShape(4)).toBe("wide");
    expect(inviteSlotShape(7)).toBe("beside");
  });
});

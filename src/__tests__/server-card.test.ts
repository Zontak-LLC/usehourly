import { describe, expect, it } from "vitest";

import { GET } from "@/app/.well-known/mcp/server-card.json/route";
import { toolDefinitions } from "@/server/mcp/protocol";

describe("the public MCP server card", () => {
  it("lists every tool the server offers, says a bearer token is required, and holds no secrets", async () => {
    const res = GET();
    expect(res.headers.get("content-type")).toContain("application/json");
    const card = (await res.json()) as {
      serverInfo: { name: string };
      authentication: unknown;
      tools: { name: string; inputSchema: { type: string } }[];
    };
    expect(card.serverInfo.name).toBe("usehourly");
    expect(card.authentication).toMatchObject({ required: true, schemes: ["oauth2", "bearer"] });
    expect(card.tools).toHaveLength(toolDefinitions().length);
    expect(card.tools.length).toBeGreaterThanOrEqual(30);
    expect(card.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["log_time", "create_invoice"]));
    expect(card.tools.every((t) => t.inputSchema.type === "object")).toBe(true);
    expect(JSON.stringify(card)).not.toMatch(/uh_[A-Za-z0-9]{20}/);
  });
});

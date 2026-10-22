"use client";

import { useState } from "react";

import { CopyBox } from "@/components/copy-box";

const TABS = ["Claude Code", "Cursor", "VS Code", "Other"] as const;
type Tab = (typeof TABS)[number];

/** The same token written the way each assistant wants it: one tab per assistant instead of four boxes in a column. */
export function ConnectSnippets({ endpoint, token }: { endpoint: string; token: string }) {
  const [tab, setTab] = useState<Tab>("Claude Code");
  const headers = { Authorization: `Bearer ${token}` };
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  const snippets: Record<Tab, { label: string; text: string }> = {
    "Claude Code": {
      label: "Run this in your terminal",
      text: `claude mcp add --transport http usehourly ${endpoint} --header "Authorization: Bearer ${token}"`,
    },
    Cursor: {
      label: "Put this in ~/.cursor/mcp.json",
      text: json({ mcpServers: { usehourly: { url: endpoint, headers } } }),
    },
    "VS Code": {
      label: "Put this in .vscode/mcp.json",
      text: json({ servers: { usehourly: { type: "http", url: endpoint, headers } } }),
    },
    Other: {
      label: "Any other MCP client that reads a JSON config",
      text: json({ mcpServers: { usehourly: { type: "http", url: endpoint, headers } } }),
    },
  };
  const now = snippets[tab];
  return (
    <div className="grid gap-3">
      <div
        role="tablist"
        aria-label="Your assistant"
        className="flex flex-wrap gap-1 rounded-full bg-muted p-1 sm:w-fit"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            onClick={() => setTab(t)}
            className={`min-h-9 rounded-full px-4 font-semibold text-sm ${
              t === tab ? "bg-amber text-[#1b1405]" : "text-foreground/75 hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <CopyBox label={now.label} text={now.text} />
    </div>
  );
}

"use client";

import { type ReactNode, useEffect, useState } from "react";

import { ClaudeMark, CursorMark, OpenAIMark } from "@/components/assistant-logos";
import { CopyBox } from "@/components/copy-box";
import { SectionCard } from "@/components/section-card";

type Choice = "claude" | "chatgpt" | "cursor" | "code";

const CHOICES: { id: Choice; label: string; Logo: typeof ClaudeMark }[] = [
  { id: "claude", label: "Claude", Logo: ClaudeMark },
  { id: "chatgpt", label: "ChatGPT", Logo: OpenAIMark },
  { id: "cursor", label: "Cursor", Logo: CursorMark },
  { id: "code", label: "Claude Code", Logo: ClaudeMark },
];

/** The three plain steps for one assistant, written in words. `endpoint` is this site's MCP address. */
function steps(choice: Choice, endpoint: string): { text: ReactNode; extra?: ReactNode }[] {
  switch (choice) {
    case "claude":
      return [
        { text: "Open Claude (the website or the desktop app), then Settings, then Connectors." },
        { text: "Choose Add custom connector. Name it UseHourly and paste the server address above." },
        { text: "Choose Connect. Log in to UseHourly and approve." },
      ];
    case "chatgpt":
      return [
        { text: "Open ChatGPT, then Settings, then Connectors. Under Advanced, turn on Developer mode." },
        { text: "Choose Create. Name it UseHourly, paste the server address above, and choose OAuth for the sign-in." },
        {
          text: "Create it, then log in to UseHourly and approve. Custom connectors need a ChatGPT plan that allows them.",
        },
      ];
    case "cursor":
      return [
        { text: "Open Cursor, then Settings, then MCP." },
        {
          text: "Add a new server and paste this into the config file:",
          extra: <CopyBox text={JSON.stringify({ mcpServers: { usehourly: { url: endpoint } } }, null, 2)} />,
        },
        { text: "Restart Cursor if it asks. Log in to UseHourly and approve." },
      ];
    case "code":
      return [
        {
          text: "Run this in your terminal:",
          extra: <CopyBox text={`claude mcp add --transport http usehourly ${endpoint}`} />,
        },
        { text: "Type /mcp, choose usehourly, and approve in your browser." },
      ];
  }
}

/**
 * The whole job of this page: get an assistant such as Claude or ChatGPT talking to UseHourly. The server address to
 * copy, one choice of assistant, three short steps in words, and what to say first. Nothing else.
 */
export function ConnectAssistant() {
  const [choice, setChoice] = useState<Choice>("claude");
  // The address of this site, known only in the browser (the server renders a neutral path first).
  const [endpoint, setEndpoint] = useState("/api/mcp");
  useEffect(() => setEndpoint(`${window.location.origin}/api/mcp`), []);
  const list = steps(choice, endpoint);

  return (
    <SectionCard
      title="Connect your assistant"
      description="Add UseHourly to Claude, ChatGPT or Cursor. Then ask it to log time, make a timesheet or prepare an invoice."
    >
      <div className="grid gap-5">
        <CopyBox label="Server address" text={endpoint} />
        <div className="grid gap-3">
          <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
            <legend className="sr-only">Your assistant</legend>
            {CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={choice === c.id}
                onClick={() => setChoice(c.id)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold text-sm ring-1 ring-foreground/15 transition-colors ${
                  choice === c.id ? "bg-amber text-[#1b1405] ring-transparent" : "hover:bg-muted"
                }`}
              >
                <c.Logo aria-hidden className="size-4 shrink-0" />
                {c.label}
              </button>
            ))}
          </fieldset>
          <ol className="list-decimal space-y-3 pl-6 marker:font-semibold">
            {list.map((s, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a short fixed list of steps
              <li key={i}>
                {s.text}
                {s.extra && <div className="mt-2 max-w-xl">{s.extra}</div>}
              </li>
            ))}
          </ol>
        </div>
        <p className="text-muted-foreground text-sm">
          When you approve, choose <strong className="text-foreground">Read only</strong> (it can look) or{" "}
          <strong className="text-foreground">Read and change</strong> (it can also log time and make invoices). Then
          try asking: &ldquo;Log 2 hours on Acme today.&rdquo; Menus change now and then: look for &ldquo;custom
          connector&rdquo; or &ldquo;MCP server&rdquo; in your assistant&rsquo;s settings. Any assistant that supports
          MCP works the same way.
        </p>
      </div>
    </SectionCard>
  );
}

"use client";

import { type ReactNode, useEffect, useState } from "react";

import { ExternalLink } from "lucide-react";

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

/** A link that takes you straight to the place in the assistant where the next step happens. */
function Go({ href, children }: { href: string; children: ReactNode }) {
  const outside = href.startsWith("http");
  return (
    <a
      href={href}
      {...(outside ? { target: "_blank", rel: "noreferrer" } : {})}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-4 font-semibold text-background text-sm transition-opacity hover:opacity-90"
    >
      {children}
      {outside && <ExternalLink className="size-3.5" aria-hidden />}
    </a>
  );
}

/** Cursor installs an MCP server from a link: the name and the config, the config as base64 JSON. */
function cursorInstallLink(endpoint: string): string {
  const config = btoa(JSON.stringify({ url: endpoint }));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=usehourly&config=${encodeURIComponent(config)}`;
}

/**
 * Two or three short steps for one assistant, each with the link, button or text it needs right there (2026-10-23:
 * the steps used to describe menus in words). `endpoint` is this site's MCP address.
 */
function steps(choice: Choice, endpoint: string): { text: ReactNode; extra?: ReactNode }[] {
  const address = <CopyBox text={endpoint} />;
  switch (choice) {
    case "claude":
      return [
        {
          text: "Open Claude's connectors.",
          extra: <Go href="https://claude.ai/settings/connectors">Open Claude connectors</Go>,
        },
        { text: "Choose Add custom connector, name it UseHourly and paste this address:", extra: address },
        { text: "Choose Connect, then log in to UseHourly and approve." },
      ];
    case "chatgpt":
      return [
        {
          text: "Open ChatGPT's connectors and turn on Developer mode (under Advanced).",
          extra: <Go href="https://chatgpt.com/#settings/Connectors">Open ChatGPT connectors</Go>,
        },
        { text: "Choose Create, name it UseHourly, paste this address and pick OAuth:", extra: address },
        { text: "Create it, then log in to UseHourly and approve. (Your ChatGPT plan must allow custom connectors.)" },
      ];
    case "cursor":
      return [
        {
          text: "Add UseHourly to Cursor in one click.",
          extra: <Go href={cursorInstallLink(endpoint)}>Add to Cursor</Go>,
        },
        { text: "In Cursor, choose Install, then log in to UseHourly and approve." },
      ];
    case "code":
      return [
        {
          text: "Run this in your terminal:",
          extra: <CopyBox text={`claude mcp add --transport http usehourly ${endpoint}`} />,
        },
        { text: "In Claude Code type /mcp, choose usehourly, and approve in your browser." },
      ];
  }
}

/**
 * The whole job of this card: get an assistant such as Claude or ChatGPT talking to UseHourly. Pick the assistant, then
 * two or three short steps with the link or the text to copy right where it is needed, and what to say first.
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
      description="Let Claude, ChatGPT or Cursor log time, make timesheets and prepare invoices for you."
    >
      <div className="grid gap-5">
        <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
          <legend className="mb-2 font-medium text-sm">Which assistant do you use?</legend>
          {CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={choice === c.id}
              onClick={() => setChoice(c.id)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold text-sm ring-1 ring-foreground/15 transition-colors ${
                choice === c.id ? "bg-foreground text-background ring-transparent" : "hover:bg-muted"
              }`}
            >
              <c.Logo aria-hidden className="size-4 shrink-0" />
              {c.label}
            </button>
          ))}
        </fieldset>
        <ol className="grid gap-4">
          {list.map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a short fixed list of steps
            <li key={i} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
              <span
                aria-hidden
                className="grid size-7 place-items-center rounded-full bg-muted font-bold font-mono text-xs"
              >
                {i + 1}
              </span>
              <div className="grid min-w-0 gap-2 pt-0.5">
                <p>{s.text}</p>
                {s.extra && <div className="max-w-xl">{s.extra}</div>}
              </div>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground text-sm">
          Then try: <strong className="text-foreground">&ldquo;Log 2 hours on Acme today.&rdquo;</strong> When you
          approve, Read only lets it look; Read and change also lets it log time and make invoices.
        </p>
      </div>
    </SectionCard>
  );
}

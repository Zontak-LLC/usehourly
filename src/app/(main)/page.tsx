import Link from "next/link";

import { ArrowRight, Bot, FileText, KeyRound, MessageSquare, Server, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { LandingHero } from "@/components/landing-hero";
import { LandingStory } from "@/components/landing-story";
import { LogoMark } from "@/components/logo";
import { SupportHourly } from "@/components/support-hourly";
import { Supporters } from "@/components/supporters";
import { TryDemoButton } from "@/components/try-demo-button";
import { APP_CONFIG } from "@/config/app-config";
import { donateUrl } from "@/lib/donate";

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "UseHourly",
  url: "https://usehourly.app",
  description:
    "A free time tracking app for freelancers that works with your AI assistant: a built-in MCP server lets Claude, ChatGPT, Cursor and others log time, build timesheets and prepare invoices. Also quick daily entry, a timer, invoices and exports.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Quick daily time entry",
    "Start/stop timer",
    "Weekly timesheet and month calendar",
    "Invoices as PDF",
    "Year-end report and Excel export",
    "MCP server: your AI assistant can log time, build timesheets for clients and prepare invoices",
  ],
};

export const metadata: Metadata = {
  title: "UseHourly: free time tracking for freelancers, built for AI assistants",
  description:
    "UseHourly is a free time tracker with a built-in MCP server. Connect Claude, ChatGPT or Cursor and ask it to log time, build a timesheet for a client and prepare invoices. Or log your day in seconds yourself. No cost, no ads.",
  alternates: { canonical: "/" },
};

const primary =
  "inline-flex h-12 items-center justify-center rounded-lg border border-tint-edge bg-tint px-6 font-medium text-base text-foreground transition-colors hover:bg-tint-hover";
const secondary =
  "inline-flex h-12 items-center justify-center rounded-lg border bg-background px-6 font-medium text-base transition-colors hover:bg-muted";

const AI_POINTS = [
  {
    Icon: MessageSquare,
    title: "Ask in plain words",
    body: "Log 1h30 on a project, move an entry, or get hours per project for the month.",
  },
  {
    Icon: FileText,
    title: "Timesheets and invoices, not just entries",
    body: "Ask for the week as a grid, have gaps pointed out, get a link your client can read and approve, or have an invoice prepared. It asks before it shares, sends or deletes.",
  },
  {
    Icon: KeyRound,
    title: "You hold the key",
    body: "Log in and approve, or make an access token on your Account page. Choose read only or read and change, and revoke it any time.",
  },
  {
    Icon: ShieldCheck,
    title: "Only your own data",
    body: "An assistant sees just your account, and it can't change your password or make more tokens.",
  },
];

/** A simple spark mark for Claude, drawn here (not Anthropic's logo file). */
function ClaudeSpark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden
      fill="none"
      stroke="#D97757"
      strokeLinecap="round"
      strokeWidth="4"
    >
      {Array.from({ length: 12 }, (_, i) => {
        const deg = i * 30;
        const a = (deg * Math.PI) / 180;
        const r2 = i % 2 ? 16 : 21;
        return (
          <line
            key={`ray-${deg}`}
            x1={24 + 6 * Math.cos(a)}
            y1={24 + 6 * Math.sin(a)}
            x2={24 + r2 * Math.cos(a)}
            y2={24 + r2 * Math.sin(a)}
          />
        );
      })}
    </svg>
  );
}

function FlowNode({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-[5.25rem] flex-col items-center gap-2 text-center sm:w-28">
      <div className="flex size-14 items-center justify-center rounded-2xl border bg-card shadow-sm sm:size-20">
        {children}
      </div>
      <p className="font-medium text-sm leading-tight">{label}</p>
    </div>
  );
}

/** Claude, then the MCP server, then UseHourly: how an assistant reaches your time. */
function McpFlow() {
  return (
    <div
      className="flex items-start justify-center gap-0.5 sm:gap-3"
      role="img"
      aria-label="Diagram: your AI assistant, such as Claude, talks to the UseHourly MCP server, which reads and writes your UseHourly time."
    >
      <FlowNode label="Claude">
        <ClaudeSpark className="size-8 sm:size-11" />
      </FlowNode>
      <ArrowRight className="mt-5 size-4 shrink-0 text-muted-foreground sm:mt-8 sm:size-6" aria-hidden />
      <FlowNode label="MCP server">
        <Server className="size-8 text-muted-foreground sm:size-9" aria-hidden />
      </FlowNode>
      <ArrowRight className="mt-5 size-4 shrink-0 text-muted-foreground sm:mt-8 sm:size-6" aria-hidden />
      <FlowNode label="UseHourly">
        <LogoMark className="size-8 sm:size-11" aria-hidden />
      </FlowNode>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant JSON, not user input */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <LogoMark className="size-8" aria-hidden />
          {APP_CONFIG.name}
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/help" className="rounded-lg px-4 py-2 font-medium text-sm hover:bg-muted max-sm:hidden">
            Guide
          </Link>
          <Link
            href="/auth/v2/login"
            className="whitespace-nowrap rounded-lg px-3 py-2 font-medium text-sm hover:bg-muted sm:px-4"
          >
            Log in
          </Link>
          <Link
            href="/auth/v2/register"
            className="whitespace-nowrap rounded-lg border border-tint-edge bg-tint px-3 py-2 font-medium text-foreground text-sm hover:bg-tint-hover sm:px-4"
          >
            Create account
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-8 pb-16 md:pt-14">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 font-medium text-sm">
                <Bot className="size-4" aria-hidden />
                Free, open source, built for AI assistants
              </p>
              <h1 className="mt-5 max-w-xl font-extrabold text-5xl leading-[0.98] tracking-tight md:text-7xl">
                Log a day in <span className="text-amber">seconds.</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg text-muted-foreground md:text-xl">
                Time tracking for freelancers. Type <strong className="text-foreground">1.5</strong> or{" "}
                <strong className="text-foreground">90m</strong>, press Enter, done. Or tell your AI assistant:{" "}
                <strong className="text-foreground">
                  &ldquo;log 3 hours on Acme, then make this week&rsquo;s timesheet.&rdquo;
                </strong>
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/auth/v2/register"
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 font-semibold text-base text-primary-foreground transition-transform hover:-translate-y-0.5"
                >
                  Create a free account
                </Link>
                <TryDemoButton className={secondary}>Try the demo, no sign-up</TryDemoButton>
              </div>
              <p className="mt-3 text-muted-foreground text-sm">
                No paywall, no ads. The demo has sample data and is deleted after a day.{" "}
                <a href="#ai-assistants" className="underline underline-offset-4">
                  Connect your assistant
                </a>
              </p>
            </div>
            <LandingHero />
          </div>
        </section>

        <section className="border-t bg-muted/40">
          <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
            <h2 className="max-w-2xl font-extrabold text-3xl tracking-tight md:text-5xl">
              From hours to paid, without the busywork.
            </h2>
            <div className="mt-10">
              <LandingStory />
            </div>
          </div>
        </section>

        <section id="ai-assistants" className="border-t">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:py-24 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 font-medium text-sm">
                <Bot className="size-4" aria-hidden />
                AI first
              </p>
              <h2 className="mt-4 font-semibold text-3xl tracking-tight md:text-4xl">
                Ask your assistant. It&rsquo;s in your timesheet.
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                UseHourly has a built-in server for <strong className="text-foreground">MCP</strong>, the open standard
                that lets AI assistants such as Claude, ChatGPT and Cursor work with your apps. If you spend your day in
                an assistant, you can log time, run the timer, build a client&rsquo;s timesheet and prepare an invoice
                without opening UseHourly at all.
              </p>
              <ul className="mt-6 grid gap-4">
                {AI_POINTS.map(({ Icon, title, body }) => (
                  <li key={title} className="flex gap-3">
                    <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="text-muted-foreground">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-xl border bg-card p-4 text-sm">
                <p className="font-semibold">Connect in a minute</p>
                <ol className="mt-2 list-decimal space-y-2 pl-5 text-muted-foreground">
                  <li>
                    Add this server to your assistant:{" "}
                    <code className="break-all rounded bg-muted px-1.5 py-0.5 text-foreground">
                      https://usehourly.app/api/mcp
                    </code>
                  </li>
                  <li>Log in to UseHourly and approve. Choose read only or read and change.</li>
                  <li>Ask it to log your time or prepare this week&rsquo;s timesheet.</li>
                </ol>
                <p className="mt-3 text-muted-foreground">
                  Claude Code:{" "}
                  <code className="break-all rounded bg-muted px-1.5 py-0.5 text-foreground">
                    claude mcp add --transport http usehourly https://usehourly.app/api/mcp
                  </code>
                </p>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/auth/v2/register" className={primary}>
                  Create a free account
                </Link>
                <Link href="/help/ai-assistants" className={secondary}>
                  Setup guide
                </Link>
              </div>
              <p className="mt-3 text-muted-foreground text-sm">
                Works with Claude, ChatGPT, Cursor and other MCP-compatible assistants. Free, like the rest of
                UseHourly.
              </p>
            </div>

            <div className="mx-auto flex w-full min-w-0 max-w-md flex-col gap-8">
              <McpFlow />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <h2 className="text-center font-semibold text-3xl tracking-tight md:text-4xl">
            Everything you need, nothing you don&rsquo;t.
          </h2>
          <ul className="mx-auto mt-10 grid max-w-4xl gap-x-10 gap-y-6 sm:grid-cols-2">
            {[
              ["Clients and projects", "Keep each client's projects together, with an hourly rate on each."],
              ["Start and stop timer", "Prefer to track as you go? One button starts it, one stops it."],
              ["Month calendar", "See how every day and week added up at a glance."],
              ["Excel export", "Take any week, month or year into a spreadsheet in one click."],
            ].map(([title, body]) => (
              <li key={title}>
                <p className="font-semibold text-lg">{title}</p>
                <p className="mt-1 text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <SupportHourly variant="band" />
        <Supporters />

        <section className="border-t bg-primary text-primary-foreground">
          <div className="mx-auto max-w-3xl px-6 py-16 text-center md:py-20">
            <h2 className="font-semibold text-3xl tracking-tight md:text-4xl">Start tracking today.</h2>
            <p className="mt-3 text-lg text-primary-foreground/80">
              It takes a minute to set up, and seconds a day after that.
            </p>
            <Link
              href="/auth/v2/register"
              className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-background px-6 font-medium text-base text-foreground transition-colors hover:bg-background/90"
            >
              Create a free account
            </Link>
            <TryDemoButton className="mt-2 inline-block py-2 font-medium text-primary-foreground/90 text-sm underline underline-offset-4 hover:text-primary-foreground">
              or try the demo first
            </TryDemoButton>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-muted-foreground text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span>{APP_CONFIG.copyright}</span>
        <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {donateUrl() && (
            <a
              href={donateUrl() ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block whitespace-nowrap py-2 hover:text-foreground"
            >
              Support UseHourly
            </a>
          )}
          <a
            href="https://github.com/Zontak-LLC/usehourly/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block whitespace-nowrap py-2 hover:text-foreground"
          >
            Report a bug
          </a>
          <Link href="/privacy" className="inline-block whitespace-nowrap py-2 hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="inline-block whitespace-nowrap py-2 hover:text-foreground">
            Terms
          </Link>
          <Link href="/auth/v2/login" className="inline-block whitespace-nowrap py-2 hover:text-foreground">
            Log in
          </Link>
        </span>
      </footer>
    </div>
  );
}

import Link from "next/link";

import {
  ArrowRight,
  Bot,
  Code2,
  FileText,
  Heart,
  KeyRound,
  MessageSquare,
  Server,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";

import { LandingHero } from "@/components/landing-hero";
import { LandingStory } from "@/components/landing-story";
import { LogoMark } from "@/components/logo";
import { Reveal } from "@/components/reveal";
import { Supporters } from "@/components/supporters";
import { TryDemoButton } from "@/components/try-demo-button";
import { APP_CONFIG } from "@/config/app-config";
import { DONATE_PLATFORM, donateUrl } from "@/lib/donate";

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
  "inline-flex h-12 items-center justify-center whitespace-nowrap rounded-xl border bg-background/60 px-6 font-medium text-base backdrop-blur transition-colors hover:bg-muted";

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
    <div className="relative min-h-dvh overflow-x-clip bg-background text-foreground dark:bg-[linear-gradient(180deg,#1c1040_0%,#140f33_28%,#0f1a38_62%,#1d1040_100%)]">
      {/* The aurora: three soft colour glows (amber, violet, mint) behind the top of the page, the same palette as the Zontak LLC site. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[44rem] overflow-hidden">
        <div className="absolute -top-40 left-[8%] size-[34rem] rounded-full bg-[#F5A524]/25 blur-3xl motion-safe:animate-[drift_14s_ease-in-out_infinite]" />
        <div className="absolute -top-24 right-[6%] size-[30rem] rounded-full bg-[#8A6CFF]/25 blur-3xl motion-safe:animate-[drift_18s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-40 left-[42%] size-[24rem] rounded-full bg-[#3DDC97]/15 blur-3xl motion-safe:animate-[drift_22s_ease-in-out_infinite]" />
      </div>
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
                Log a day in{" "}
                <span className="bg-gradient-to-r from-[#F5A524] via-[#ff7a45] to-[#8A6CFF] bg-clip-text text-transparent">
                  seconds.
                </span>
              </h1>
              <p className="mt-5 max-w-lg text-lg text-muted-foreground md:text-xl">
                Time tracking for freelancers. Type <strong className="text-foreground">1.5</strong> or{" "}
                <strong className="text-foreground">90m</strong>, press Enter, done. Or tell your AI assistant:{" "}
                <strong className="text-foreground">
                  &ldquo;log 3 hours on Acme, then make this week&rsquo;s timesheet.&rdquo;
                </strong>
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/auth/v2/register"
                  className="inline-flex h-12 items-center justify-center whitespace-nowrap rounded-xl bg-gradient-to-b from-[#F5A524] to-[#e8820b] px-6 font-semibold text-[#1b1405] text-base shadow-[0_10px_30px_-10px_#F5A524] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-10px_#F5A524]"
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

        <section className="border-t bg-gradient-to-b from-[#8A6CFF]/10 via-transparent to-[#3DDC97]/10">
          <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
            <Reveal>
              <h2 className="max-w-2xl font-extrabold text-3xl tracking-tight md:text-5xl">
                From hours to paid, without the busywork.
              </h2>
            </Reveal>
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
          <ul className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2">
            {[
              ["Clients and projects", "Keep each client's projects together, with an hourly rate on each.", "#F5A524"],
              ["Start and stop timer", "Prefer to track as you go? One button starts it, one stops it.", "#8A6CFF"],
              ["Month calendar", "See how every day and week added up at a glance.", "#3DDC97"],
              ["Excel export", "Take any week, month or year into a spreadsheet in one click.", "#ff7a45"],
            ].map(([title, body, color], n) => (
              <Reveal
                as="li"
                delay={n * 90}
                key={title}
                className="relative overflow-hidden rounded-3xl border bg-card p-5 shadow-[var(--shadow-sheet)]"
              >
                <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
                <p className="font-bold font-display text-xl">{title}</p>
                <p className="mt-1 text-muted-foreground">{body}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* The finale, in two parts: three promises (free, open, made with AI), then one big invitation. */}
        <section aria-labelledby="promises-heading" className="relative mx-auto max-w-6xl px-6 pt-16 pb-8 md:pt-24">
          <Reveal>
            <p className="text-center font-mono text-muted-foreground text-xs uppercase tracking-[0.3em]">
              The small print, said out loud
            </p>
            <h2
              id="promises-heading"
              className="mt-3 text-center font-display font-extrabold text-4xl tracking-tight md:text-6xl"
            >
              Free. Open.{" "}
              <span className="bg-gradient-to-r from-[#ff5d8f] via-[#F5A524] to-[#3DDC97] bg-clip-text text-transparent">
                Honest.
              </span>
            </h2>
          </Reveal>
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                Icon: Heart,
                color: "#ff5d8f",
                title: "Free, really",
                body: "No paywall, no ads. The owner pays for the servers. If it saves you time, you can chip in.",
                action: donateUrl() ? (
                  <a
                    href={donateUrl() ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-[#ff5d8f] px-4 py-2 font-semibold text-[#1b0610] text-sm transition-transform hover:-translate-y-0.5"
                  >
                    <Heart className="size-4" aria-hidden /> Support on {DONATE_PLATFORM}
                  </a>
                ) : null,
              },
              {
                Icon: Code2,
                color: "#3DDC97",
                title: "Open source",
                body: "MIT licensed. Read every line on GitHub, report a bug, or run your own copy.",
                action: (
                  <a
                    href="https://github.com/Zontak-LLC/usehourly"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-[#3DDC97] px-4 py-2 font-semibold text-[#04170e] text-sm transition-transform hover:-translate-y-0.5"
                  >
                    <Code2 className="size-4" aria-hidden /> View the code
                  </a>
                ),
              },
              {
                Icon: Sparkles,
                color: "#8A6CFF",
                title: "Proudly created with AI",
                body: "One person set the direction and judged every screen. An AI assistant wrote the code, the tests and the words, and checked its own work.",
                action: null,
              },
            ].map(({ Icon, color, title, body, action }, n) => (
              <Reveal
                as="li"
                delay={n * 120}
                key={title}
                className="group/promise relative flex flex-col gap-3 overflow-hidden rounded-3xl border bg-card/70 p-6 backdrop-blur"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full opacity-30 blur-3xl transition-opacity duration-500 group-hover/promise:opacity-60"
                  style={{ backgroundColor: color }}
                />
                <span
                  aria-hidden
                  className="relative grid size-12 place-items-center rounded-2xl"
                  style={{ backgroundColor: `${color}26`, color }}
                >
                  <Icon className="size-6" />
                </span>
                <h3 className="relative font-bold font-display text-2xl">{title}</h3>
                <p className="relative text-muted-foreground">{body}</p>
                {action && <div className="relative mt-auto pt-2">{action}</div>}
              </Reveal>
            ))}
          </ul>
        </section>
        <Supporters />

        <section aria-labelledby="start-heading" className="mx-auto max-w-6xl px-6 pt-8 pb-20 md:pb-28">
          <Reveal className="relative isolate overflow-hidden rounded-[2.5rem] bg-[length:300%_100%] bg-[linear-gradient(120deg,#F5A524,#ff7a45,#8A6CFF,#3DDC97,#F5A524)] px-6 py-16 text-center text-[#0B0C10] shadow-[0_30px_80px_-30px_#8A6CFF] motion-safe:animate-[hue-shift_16s_ease-in-out_infinite] md:py-24">
            {/* A big pale clock face turning slowly behind the words. */}
            <svg
              aria-hidden
              viewBox="0 0 200 200"
              className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/2 text-white/25 motion-safe:animate-[spin_120s_linear_infinite]"
            >
              <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="1.5" />
              {Array.from({ length: 60 }, (_, i) => {
                const angle = (i / 60) * Math.PI * 2;
                const inner = i % 5 === 0 ? 84 : 91;
                return (
                  <line
                    key={i}
                    x1={100 + 96 * Math.sin(angle)}
                    y1={100 - 96 * Math.cos(angle)}
                    x2={100 + inner * Math.sin(angle)}
                    y2={100 - inner * Math.cos(angle)}
                    stroke="currentColor"
                    strokeWidth={i % 5 === 0 ? 2.5 : 1}
                  />
                );
              })}
              <line x1="100" y1="100" x2="100" y2="30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <p className="font-mono text-xs uppercase tracking-[0.3em] opacity-70">Ready when you are</p>
            <h2 id="start-heading" className="mt-3 font-display font-extrabold text-5xl tracking-tight md:text-7xl">
              Start tracking today.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-balance text-[#0B0C10]/80 text-lg">
              It takes a minute to set up, and seconds a day after that.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3">
              <Link
                href="/auth/v2/register"
                className="group/cta relative inline-flex h-16 items-center gap-4 overflow-hidden rounded-full bg-white py-2 pr-3 pl-8 font-bold font-display text-[#0B0C10] text-xl shadow-[0_18px_40px_-14px_rgb(60_20_0/0.55),0_0_0_6px_rgb(255_255_255/0.28)] transition-all duration-300 hover:shadow-[0_24px_50px_-14px_rgb(60_20_0/0.6),0_0_0_10px_rgb(255_255_255/0.32)] motion-safe:active:scale-[0.98] motion-safe:hover:-translate-y-1"
              >
                Create a free account
                <span className="grid size-12 place-items-center rounded-full bg-[#0B0C10] text-[#F5A524] transition-transform duration-300 group-hover/cta:translate-x-1 group-hover/cta:rotate-[-12deg]">
                  <ArrowRight className="size-6" aria-hidden />
                </span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-[#F5A524]/40 to-transparent opacity-0 transition-all duration-700 group-hover/cta:left-full group-hover/cta:opacity-100"
                />
              </Link>
              <TryDemoButton className="inline-flex items-center rounded-full border border-white/50 bg-white/20 px-5 py-2 font-semibold text-[#0B0C10] text-sm backdrop-blur transition-colors hover:bg-white/35">
                or try the demo first, no sign-up
              </TryDemoButton>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-muted-foreground text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span>{APP_CONFIG.copyright} · Proudly created with AI</span>
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

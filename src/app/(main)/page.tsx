import Image from "next/image";
import Link from "next/link";

import { ArrowRight, Bot, FileText, KeyRound, MessageSquare, Server, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { LogoMark } from "@/components/logo";
import { ProductTour } from "@/components/product-tour";
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

/** A screenshot in a simple window frame. The pictures are the real app, not mock-ups. */
function Screen({
  src,
  alt,
  width,
  height,
  priority = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-xl ring-1 ring-black/5">
      <div className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-3" aria-hidden>
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
      </div>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        sizes="(min-width: 1024px) 60rem, 100vw"
        className="h-auto w-full"
      />
    </div>
  );
}

const FEATURES = [
  {
    id: "week",
    title: "A real weekly timesheet.",
    body: "Every project and every day in one grid. Type straight into any cell, fill several days at once, then export the week to Excel.",
    image: { src: "/landing/week-v3.webp", width: 2144, height: 1310 },
    alt: "The weekly timesheet: projects down the side, the days of the week across, with totals, and a Share & export menu.",
    // A wide, dense table: it gets the full width, under its text, so the numbers stay readable.
    wide: true,
  },
  {
    id: "month",
    title: "See the whole month at a glance.",
    body: "A calendar that shows how every day and week added up, with a breakdown by project underneath. Spot a light week before it costs you.",
    image: { src: "/landing/month-v3.webp", width: 2144, height: 1090 },
    alt: "The month calendar: each day shaded by hours logged, with weekly totals on the right.",
    wide: false,
  },
  {
    id: "year",
    title: "Ready for invoices and tax time.",
    body: "Turn your tracked hours into invoices you can send as a PDF. At year end, see hours, earnings, invoiced and received by quarter and by month, ready for your accountant.",
    image: { src: "/landing/report-v3.webp", width: 2144, height: 1230 },
    alt: "The year summary: hours worked, earned, invoiced, received and outstanding, with a table by quarter.",
    wide: false,
  },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant JSON, not user input */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
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
            className="whitespace-nowrap rounded-lg px-4 py-2 font-medium text-sm hover:bg-muted"
          >
            Log in
          </Link>
          <Link
            href="/auth/v2/register"
            className="whitespace-nowrap rounded-lg border border-tint-edge bg-tint px-4 py-2 font-medium text-foreground text-sm hover:bg-tint-hover"
          >
            Create an account
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-10 pb-16 text-center md:pt-20">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 font-medium text-sm">
            <Bot className="size-4" aria-hidden />
            Free, open source, with a built-in MCP server
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl font-semibold text-4xl tracking-tight md:text-6xl">
            Your timesheet, run by your AI assistant.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Connect Claude, ChatGPT, Cursor or any MCP assistant and say{" "}
            <strong className="text-foreground">
              &ldquo;log 3 hours on Acme, then make this week&rsquo;s timesheet for sign-off.&rdquo;
            </strong>{" "}
            UseHourly keeps the time, the timesheets and the invoices. Prefer typing? Press{" "}
            <strong className="text-foreground">1.5</strong> or <strong className="text-foreground">90m</strong> and
            Enter and you&rsquo;re done.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="#ai-assistants" className={`${primary} w-full max-w-xs sm:w-auto`}>
              Connect your assistant
            </a>
            <Link href="/auth/v2/register" className={`${secondary} w-full max-w-xs sm:w-auto`}>
              Create a free account
            </Link>
            <TryDemoButton className={`${secondary} w-full max-w-xs sm:w-auto`}>Try the demo, no sign-up</TryDemoButton>
          </div>
          <p className="mt-3 text-muted-foreground text-sm">
            Free to use. No paywall, no ads. The demo comes with sample data and is deleted after a day.
          </p>

          <div className="mx-auto mt-14 max-w-5xl text-left">
            <ProductTour />
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
              <figure className="w-full">
                {/* A looping, silent clip of the conversation (scripts/social/render.mjs makes it); the words are below for everyone else. */}
                <video
                  className="w-full rounded-2xl border bg-card shadow-sm"
                  poster="/landing/assistant-demo-poster.webp"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label="Example conversation: a freelancer asks an AI assistant to log 1 hour 30 minutes on the Acme website project, then to build this week's timesheet for Acme. The assistant shows 12.5 hours, points out that Tuesday has nothing logged, adds 2 hours on request, and creates a private link the client can approve."
                >
                  <source src="/landing/assistant-demo.mp4" type="video/mp4" />
                </video>
                <figcaption className="mt-3 text-center text-muted-foreground text-xs">
                  An example conversation. Your assistant&rsquo;s wording will differ.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <div className="border-t bg-muted/30">
          {FEATURES.map((f, i) => (
            <section key={f.id} className="mx-auto max-w-6xl px-6 py-16 md:py-24">
              {f.wide ? (
                <div>
                  <div className="mx-auto max-w-2xl text-center">
                    <h2 className="font-semibold text-3xl tracking-tight md:text-4xl">{f.title}</h2>
                    <p className="mt-4 text-lg text-muted-foreground">{f.body}</p>
                  </div>
                  <div className="mt-10">
                    <Screen src={f.image.src} alt={f.alt} width={f.image.width} height={f.image.height} />
                  </div>
                </div>
              ) : (
                <div
                  className={`grid items-center gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] ${
                    i % 2 ? "lg:[&>div:first-child]:order-2" : ""
                  }`}
                >
                  <div>
                    <h2 className="font-semibold text-3xl tracking-tight md:text-4xl">{f.title}</h2>
                    <p className="mt-4 text-lg text-muted-foreground">{f.body}</p>
                  </div>
                  <div>
                    <Screen src={f.image.src} alt={f.alt} width={f.image.width} height={f.image.height} />
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>

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

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-muted-foreground text-sm">
        <span>{APP_CONFIG.copyright}</span>
        <span className="flex items-center gap-4">
          {donateUrl() && (
            <a
              href={donateUrl() ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block py-2 hover:text-foreground"
            >
              Support UseHourly
            </a>
          )}
          <a
            href="https://github.com/Zontak-LLC/usehourly/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block py-2 hover:text-foreground"
          >
            Report a bug
          </a>
          <Link href="/privacy" className="inline-block py-2 hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="inline-block py-2 hover:text-foreground">
            Terms
          </Link>
          <Link href="/auth/v2/login" className="inline-block py-2 hover:text-foreground">
            Log in
          </Link>
        </span>
      </footer>
    </div>
  );
}

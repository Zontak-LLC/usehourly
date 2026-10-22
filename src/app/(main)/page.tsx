import Link from "next/link";

import { ArrowRight, Bot, Code2, Heart, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { ThemeSwitcher } from "@/app/(main)/dashboard/_components/header/theme-switcher";
import { AssistantTerminal } from "@/components/assistant-terminal";
import { LandingFeatures } from "@/components/landing-features";
import { LandingScenes } from "@/components/landing-scenes";
import { LandingShowcase } from "@/components/landing-showcase";
import { LandingStory } from "@/components/landing-story";
import { LogoMark } from "@/components/logo";
import { Reveal } from "@/components/reveal";
import { Supporters } from "@/components/supporters";
import { TryDemoButton } from "@/components/try-demo-button";
import { APP_CONFIG } from "@/config/app-config";
import { DONATE_PLATFORM, donateUrl } from "@/lib/donate";
import { round3 } from "@/lib/round3";

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
    "Quick daily time entry and a start/stop timer",
    "Weekly timesheet and month calendar",
    "Invoices as PDF, by email or as a private link, with overdue reminders",
    "Timesheets a client can read and approve",
    "Teams: let others log time on the clients you choose",
    "Project budgets, billing rounding and a currency for each client",
    "Meetings from your calendar turned into time entries",
    "Year summary for taxes, Excel export, and Xero and QuickBooks files",
    "Works offline and installs like an app",
    "Export all your data, or import from Toggl and Clockify",
    "MCP server: your AI assistant can log time, build timesheets for clients and prepare invoices",
  ],
};

export const metadata: Metadata = {
  title: "UseHourly: free time tracking for freelancers, built for AI assistants",
  description:
    "UseHourly is a free time tracker with a built-in MCP server. Connect Claude, ChatGPT or Cursor and ask it to log time, build a timesheet for a client and prepare invoices. Or log your day in seconds yourself. No cost, no ads.",
  alternates: { canonical: "/" },
};

const secondary =
  "inline-flex h-12 items-center justify-center whitespace-nowrap rounded-xl border bg-background/60 px-6 font-medium text-base backdrop-blur transition-colors hover:bg-muted";

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
          {/* On a phone the header has no room for it: the button sits in the footer there. */}
          <span className="max-sm:hidden">
            <ThemeSwitcher />
          </span>
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
          <div className="flex flex-col items-center gap-12">
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 font-medium text-sm">
                <Bot className="size-4" aria-hidden />
                Free, open source, built for AI assistants
              </p>
              <h1 className="mt-5 max-w-3xl font-extrabold text-5xl leading-[0.98] tracking-tight md:text-7xl">
                Log a day in{" "}
                <span className="bg-gradient-to-r from-[#F5A524] via-[#ff7a45] to-[#8A6CFF] bg-clip-text text-transparent">
                  seconds.
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-muted-foreground md:text-xl">
                Time tracking for freelancers. Type <strong className="text-foreground">1.5</strong> or{" "}
                <strong className="text-foreground">90m</strong>, press Enter, done. Or tell your AI assistant:{" "}
                <strong className="text-foreground">
                  &ldquo;log 3 hours on Acme, then make this week&rsquo;s timesheet.&rdquo;
                </strong>
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
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
            <div id="ai-assistants" className="w-full max-w-4xl scroll-mt-6">
              <h2 className="sr-only">Ask your AI assistant. It&rsquo;s in your timesheet.</h2>
              <AssistantTerminal />
              <div className="mt-6 flex flex-col items-center gap-3 text-center">
                <code className="max-w-full break-all rounded-lg bg-muted px-3 py-2 text-foreground text-sm">
                  claude mcp add --transport http usehourly https://usehourly.app/api/mcp
                </code>
                <Link href="/help/ai-assistants" className="text-muted-foreground text-sm underline underline-offset-4">
                  Works with Claude, ChatGPT, Cursor and other MCP assistants. Setup guide
                </Link>
              </div>
            </div>
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

        <section id="see-it" className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <h2 className="text-center font-display font-extrabold text-3xl tracking-tight md:text-5xl">
            See it working.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-lg text-muted-foreground">
            Real screens from the app, with sample data. Scroll to flip through them.
          </p>
          <div className="mt-8">
            <LandingShowcase />
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-6 pb-16 md:pb-24">
          <h2 className="text-center font-display font-extrabold text-3xl tracking-tight md:text-5xl">
            Everything a freelancer needs.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-lg text-muted-foreground">
            From the first hour you log to the invoice, the approval and the tax summary. Free, with no ads.
          </p>
          <LandingFeatures />
        </section>

        <section id="how-it-feels" className="mx-auto max-w-6xl px-6 pb-16 md:pb-24">
          <h2 className="text-center font-display font-extrabold text-3xl tracking-tight md:text-5xl">
            Small things that save your week.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-lg text-muted-foreground">
            Four of the parts people ask about most, in a few seconds each.
          </p>
          <LandingScenes />
        </section>

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
                    x1={round3(100 + 96 * Math.sin(angle))}
                    y1={round3(100 - 96 * Math.cos(angle))}
                    x2={round3(100 + inner * Math.sin(angle))}
                    y2={round3(100 - inner * Math.cos(angle))}
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
        <span className="sm:hidden">
          <ThemeSwitcher />
        </span>
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

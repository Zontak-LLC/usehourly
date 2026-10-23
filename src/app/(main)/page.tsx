import Link from "next/link";

import { ArrowRight, Bot, Code2, Heart, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { ThemeSwitcher } from "@/app/(main)/dashboard/_components/header/theme-switcher";
import { ClaudeMark, CursorMark, OpenAIMark } from "@/components/assistant-logos";
import { AssistantTerminal } from "@/components/assistant-terminal";
import { LandingFeatures } from "@/components/landing-features";
import { LandingShowcase } from "@/components/landing-showcase";
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
    "Intuitive time tracking. Free. Type 1.5, press Enter, done. Timesheets, invoices and a tax summary from your hours, and a built-in MCP server so Claude, ChatGPT, Cursor and others can log time for you.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Quick daily time entry and a stopwatch that turns into an entry",
    "Weekly timesheet that shows the gaps, and a month calendar you can drag entries across",
    "Invoices as PDF or as a private link, with paid, waiting and late at a glance",
    "Each client's month in hours and money, and one tap to make the invoice",
    "Year summary for taxes and Excel export",
    "Works offline and installs like an app",
    "Export all your data, or delete it",
    "MCP server: your AI assistant can log time, build timesheets for clients and prepare invoices",
  ],
};

export const metadata: Metadata = {
  title: "UseHourly: intuitive time tracking. Free.",
  description:
    "A free, simple time tracker. Type 1.5, press Enter, done. Your hours become timesheets, invoices and a tax summary, and your AI assistant (Claude, ChatGPT, Cursor) can log time for you. No paywall, no ads.",
  alternates: { canonical: "/" },
};

const secondary =
  "inline-flex h-12 items-center justify-center whitespace-nowrap rounded-xl border bg-background/60 px-6 font-medium text-base backdrop-blur transition-colors hover:bg-muted";

export default function LandingPage() {
  return (
    <div className="relative isolate min-h-dvh overflow-x-clip bg-background text-foreground dark:bg-[linear-gradient(180deg,#14161d_0%,#101218_45%,#0c0d11_100%)]">
      {/* The aurora: three soft colour glows (amber, violet, mint) behind the top of the page, the same palette as the Zontak LLC site.
          -z-10 inside the isolated page keeps it UNDER the text: drawn over it, the amber glow turned the black headline brown.
          Dark mode is the app's own ink, a shade darker down the page; the amber glow is off there because dimmed amber
          on ink reads brown. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem] overflow-hidden">
        <div className="absolute -top-40 left-[8%] size-[34rem] rounded-full bg-[#F5A524]/25 blur-3xl motion-safe:animate-[drift_14s_ease-in-out_infinite] dark:hidden" />
        <div className="absolute -top-24 right-[6%] size-[30rem] rounded-full bg-[#8A6CFF]/25 blur-3xl motion-safe:animate-[drift_18s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-40 left-[42%] size-[24rem] rounded-full bg-[#3DDC97]/15 blur-3xl motion-safe:animate-[drift_22s_ease-in-out_infinite]" />
      </div>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant JSON, not user input */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-base sm:text-lg">
          <LogoMark className="size-7 sm:size-8" aria-hidden />
          {APP_CONFIG.name}
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {/* On a phone the header has no room for it: the button sits in the footer there. */}
          <span className="max-sm:hidden">
            <ThemeSwitcher />
          </span>
          <Link href="/help" className="rounded-lg px-4 py-2 font-medium text-sm hover:bg-muted max-sm:hidden">
            Help
          </Link>
          <Link
            href="/auth/v2/login"
            className="whitespace-nowrap rounded-lg px-2.5 py-2 font-medium text-sm hover:bg-muted sm:px-4"
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
              {/* The headline (chosen by the owner 2026-10-23): what it is and what makes it different, then the price.
                  The line under it proves "intuitive" at once. */}
              <h1 className="mt-5 max-w-4xl text-balance font-extrabold text-5xl leading-[1.02] tracking-tight md:text-7xl">
                Intuitive time tracking. <span className="text-amber">Free.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground md:text-xl">
                Type <strong className="text-foreground">1.5</strong>, press Enter, done. Your hours become timesheets,
                invoices and a tax summary. No paywall, no ads.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/auth/v2/register"
                  className="inline-flex h-12 items-center justify-center whitespace-nowrap rounded-xl bg-gradient-to-b from-[#F5A524] to-[#e8820b] px-6 font-semibold text-[#12151b] text-base shadow-[0_10px_30px_-10px_#F5A524] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-10px_#F5A524]"
                >
                  Create a free account
                </Link>
                <TryDemoButton className={secondary}>Try the demo, no sign-up</TryDemoButton>
              </div>
              <p className="mt-3 text-muted-foreground text-sm">
                The demo has sample data and is deleted after a day.{" "}
                <a href="#ai-assistants" className="underline underline-offset-4">
                  Connect your assistant
                </a>
              </p>
            </div>
            <div id="ai-assistants" className="w-full max-w-4xl scroll-mt-6">
              {/* The AI connection is a main reason to pick UseHourly, so it is said in words, not only shown. */}
              <div className="mx-auto mb-8 flex max-w-2xl flex-col items-center gap-3 text-center">
                <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.3em]">
                  Built-in MCP server
                </p>
                <h2 className="text-balance font-display font-extrabold text-3xl tracking-tight md:text-5xl">
                  Or just ask your AI assistant.
                </h2>
                <p className="text-balance text-lg text-muted-foreground">
                  Connect Claude, ChatGPT or Cursor and say what you need: it logs your time, finds the gaps, builds
                  timesheets and prepares invoices. It asks you before it shares or bills anything.
                </p>
                <ul className="mt-1 flex flex-wrap items-center justify-center gap-2" aria-label="Works with">
                  {[
                    { name: "Claude", Mark: ClaudeMark },
                    { name: "ChatGPT", Mark: OpenAIMark },
                    { name: "Cursor", Mark: CursorMark },
                    { name: "Claude Code", Mark: ClaudeMark },
                  ].map(({ name, Mark }) => (
                    <li
                      key={name}
                      className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 font-medium text-sm"
                    >
                      <Mark aria-hidden className="size-4" />
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
              <AssistantTerminal />
              <div className="mt-6 flex flex-col items-center gap-3 text-center">
                <code className="max-w-full break-all rounded-lg bg-muted px-3 py-2 text-foreground text-sm">
                  claude mcp add --transport http usehourly https://usehourly.app/api/mcp
                </code>
                <Link
                  href="/help?a=connect-assistant"
                  className="text-muted-foreground text-sm underline underline-offset-4"
                >
                  Connect yours in a minute: the steps for each assistant
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t bg-gradient-to-b from-[#8A6CFF]/10 via-transparent to-[#3DDC97]/10 dark:border-white/5 dark:bg-none">
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
            Real screens from the app, with sample data. Flip through them with the tabs or the arrows.
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
            From the first hour you log to the invoice and the tax summary. Free, with no ads.
          </p>
          <LandingFeatures />
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
              Free. Open. <span className="text-amber">Honest.</span>
            </h2>
          </Reveal>
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                Icon: Heart,
                title: "Free, really",
                body: "No paywall, no ads. The owner pays for the servers. If it saves you time, you can chip in.",
                action: donateUrl() ? (
                  <a
                    href={donateUrl() ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-amber px-4 py-2 font-semibold text-[#12151b] text-sm transition-transform hover:-translate-y-0.5"
                  >
                    <Heart className="size-4" aria-hidden /> Support on {DONATE_PLATFORM}
                  </a>
                ) : null,
              },
              {
                Icon: Code2,
                title: "Open source",
                body: "MIT licensed. Read every line on GitHub, report a bug, or run your own copy.",
                action: (
                  <a
                    href="https://github.com/Zontak-LLC/usehourly"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 font-semibold text-foreground text-sm transition-transform hover:-translate-y-0.5"
                  >
                    <Code2 className="size-4" aria-hidden /> View the code
                  </a>
                ),
              },
              {
                Icon: Sparkles,
                title: "Proudly created with AI",
                body: "One person set the direction and judged every screen. An AI assistant wrote the code, the tests and the words, and checked its own work.",
                action: null,
              },
            ].map(({ Icon, title, body, action }, n) => (
              <Reveal
                as="li"
                delay={n * 120}
                key={title}
                className="group/promise relative flex flex-col gap-3 overflow-hidden rounded-3xl border bg-card/70 p-6 backdrop-blur"
              >
                <span
                  aria-hidden
                  className="relative grid size-12 place-items-center rounded-2xl bg-foreground/[0.06] text-foreground"
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
          <Reveal className="relative isolate overflow-hidden rounded-[2.5rem] bg-[#12151b] px-6 py-16 text-center text-white shadow-[0_30px_80px_-30px_rgb(18_21_27/0.6)] md:py-24 dark:bg-card dark:ring-1 dark:ring-foreground/10">
            <p className="font-mono text-xs uppercase tracking-[0.3em] opacity-70">Ready when you are</p>
            <h2 id="start-heading" className="mt-3 font-display font-extrabold text-5xl tracking-tight md:text-7xl">
              Start tracking today.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-balance text-lg text-white/75 dark:text-muted-foreground">
              It takes a minute to set up, and seconds a day after that.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3">
              <Link
                href="/auth/v2/register"
                className="group/cta relative inline-flex h-16 items-center gap-4 overflow-hidden rounded-full bg-amber py-2 pr-3 pl-8 font-bold font-display text-[#12151b] text-xl shadow-[0_0_0_6px_rgb(255_255_255/0.08)] transition-all duration-300 hover:shadow-[0_0_0_10px_rgb(255_255_255/0.12)] motion-safe:active:scale-[0.98] motion-safe:hover:-translate-y-1"
              >
                Create a free account
                <span className="grid size-12 place-items-center rounded-full bg-[#12151b] text-amber transition-transform duration-300 group-hover/cta:translate-x-1 group-hover/cta:rotate-[-12deg]">
                  <ArrowRight className="size-6" aria-hidden />
                </span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover/cta:left-full group-hover/cta:opacity-100"
                />
              </Link>
              <TryDemoButton className="inline-flex items-center rounded-full border border-white/25 px-5 py-2 font-semibold text-sm text-white transition-colors hover:bg-white/10 dark:border-foreground/20 dark:text-foreground dark:hover:bg-muted">
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
          <Link href="/help" className="inline-block whitespace-nowrap py-2 hover:text-foreground">
            Help
          </Link>
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

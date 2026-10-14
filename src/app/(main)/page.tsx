import Image from "next/image";
import Link from "next/link";

import type { Metadata } from "next";

import { LogoMark } from "@/components/logo";
import { SupportHourly } from "@/components/support-hourly";
import { APP_CONFIG } from "@/config/app-config";
import { donateUrl } from "@/lib/donate";

export const metadata: Metadata = {
  title: "Hourly: a simple timesheet for freelancers",
  description:
    "Log your day in seconds. Type 1.5, 1:30 or 90m, press Enter, done. A weekly timesheet, invoices and a year-end report, in one place.",
  alternates: { canonical: "/" },
};

const primary =
  "inline-flex h-12 items-center justify-center rounded-lg bg-primary px-6 font-medium text-base text-primary-foreground transition-colors hover:bg-primary/90";
const secondary =
  "inline-flex h-12 items-center justify-center rounded-lg border bg-background px-6 font-medium text-base transition-colors hover:bg-muted";

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
      <div className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-2.5" aria-hidden>
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
    image: { src: "/landing/week.webp", width: 2100, height: 820 },
    alt: "The weekly timesheet: projects down the side, the days of the week across, with totals and an Export Excel button.",
    // A wide, dense table: it gets the full width, under its text, so the numbers stay readable.
    wide: true,
  },
  {
    id: "month",
    title: "See the whole month at a glance.",
    body: "A calendar that shows how every day and week added up, with a breakdown by project underneath. Spot a light week before it costs you.",
    image: { src: "/landing/month.webp", width: 2100, height: 1280 },
    alt: "The month calendar: each day shaded by hours logged, with weekly totals on the right.",
    wide: false,
  },
  {
    id: "year",
    title: "Ready for invoices and tax time.",
    body: "Turn your tracked hours into invoices you can send as a PDF. At year end, see hours, earnings, invoiced and received by quarter and by month, ready for your accountant.",
    image: { src: "/landing/report.webp", width: 1850, height: 1150 },
    alt: "The annual report: hours worked, earned, invoiced, received and outstanding, with a table by quarter.",
    wide: false,
  },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <LogoMark className="size-8" aria-hidden />
          {APP_CONFIG.name}
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/auth/v2/login" className="rounded-lg px-4 py-2 font-medium text-sm hover:bg-muted">
            Log in
          </Link>
          <Link
            href="/auth/v2/register"
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
          >
            Create an account
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-10 pb-16 text-center md:pt-20">
          <h1 className="mx-auto max-w-3xl font-semibold text-4xl tracking-tight md:text-6xl">
            Log your day in seconds.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Hourly is a simple timesheet for freelancers. Type <strong className="text-foreground">1.5</strong>,{" "}
            <strong className="text-foreground">1:30</strong> or <strong className="text-foreground">90m</strong>, press
            Enter, and you&rsquo;re done.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/auth/v2/register" className={primary}>
              Create a free account
            </Link>
            <Link href="/auth/v2/login" className={secondary}>
              Log in
            </Link>
          </div>
          <p className="mt-3 text-muted-foreground text-sm">Free to use. No paywall, no ads.</p>

          <div className="mx-auto mt-14 max-w-4xl text-left">
            <Screen
              src="/landing/today.webp"
              alt="The Today screen: a project, a time box that accepts 1.5, 1:30 or 90m, and the day's entries with totals for the day and the week."
              width={1616}
              height={820}
              priority
            />
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
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-muted-foreground text-sm">
        <span>{APP_CONFIG.copyright}</span>
        <span className="flex items-center gap-4">
          {donateUrl() && (
            <a href={donateUrl() ?? "#"} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              Support Hourly
            </a>
          )}
          <Link href="/auth/v2/login" className="hover:text-foreground">
            Log in
          </Link>
        </span>
      </footer>
    </div>
  );
}

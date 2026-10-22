"use client";

import type { ReactNode } from "react";

import { Check, Mail, Wifi, WifiOff } from "lucide-react";

import { useScene } from "@/lib/use-scene";

const panel = "rounded-2xl bg-card p-3 ring-1 ring-foreground/10";
const cap = "font-mono text-[11px] text-foreground/75 uppercase tracking-widest";
const fade = (on: boolean) =>
  `transition-all duration-500 ${on ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`;

function Frame({ title, text, label, children }: { title: string; text: string; label: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-4 rounded-3xl bg-gradient-to-b from-card to-muted p-5 shadow-[var(--shadow-sheet)] ring-1 ring-foreground/10">
      <div role="img" aria-label={label} className="min-h-[15rem]">
        {children}
      </div>
      <div>
        <h3 className="font-bold font-display text-xl">{title}</h3>
        <p className="mt-1 text-muted-foreground">{text}</p>
      </div>
    </li>
  );
}

/** A client approves a timesheet: the sheet, a link, a name typed in, an approved stamp and the email to you. */
function SignOffScene() {
  const { ref, step } = useScene([900, 1200, 1500, 4000]);
  const name = "Maria Lopez";
  const typed = step === 2 ? name.slice(0, 7) : step >= 3 ? name : "";
  return (
    <Frame
      label="Animation: you share a timesheet as a link, your client types their name and approves, and you get an email."
      title="Clients approve what they saw"
      text="Share a frozen timesheet as a link. Your client reads it and approves with their name. You get an email, and nothing changes behind their back."
    >
      <div ref={ref} aria-hidden className="flex flex-col gap-3">
        <div className={panel}>
          <p className={`${cap} flex justify-between`}>
            <span>Timesheet · Oct 12 to 18</span>
            <span className="font-display font-extrabold text-base text-foreground normal-case tracking-normal">
              32:00 h
            </span>
          </p>
          <p className={`mt-2 inline-flex rounded-full bg-muted px-3 py-1 font-mono text-xs ${fade(step >= 1)}`}>
            usehourly.app/timesheet/…
          </p>
        </div>
        <div className={`${panel} ${fade(step >= 2)}`}>
          <p className={cap}>Your client's page</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="min-h-9 flex-1 rounded-lg bg-muted px-3 py-2 font-bold font-display">{typed || " "}</span>
            <span
              className={`rounded-lg px-4 py-2 font-semibold text-sm transition-colors duration-500 ${
                step >= 3 ? "bg-success-bright text-white" : "bg-amber text-[#1b1405]"
              }`}
            >
              {step >= 3 ? "Approved" : "Approve"}
            </span>
          </div>
        </div>
        <div
          className={`flex items-center gap-2 rounded-xl bg-amber/20 px-3 py-2 text-sm ring-1 ring-amber/50 ${fade(step >= 3)}`}
        >
          <Mail className="size-4" /> Maria Lopez approved your timesheet
        </div>
      </div>
    </Frame>
  );
}

/** Offline: the connection drops, an entry is kept on the device, the connection returns and it is sent once. */
function OfflineScene() {
  const { ref, step } = useScene([900, 1100, 1600, 4000]);
  const offline = step === 1 || step === 2;
  return (
    <Frame
      label="Animation: the connection drops, an entry you type is kept on your device, and when the connection returns it is sent once."
      title="Works with no connection"
      text="On a train or a plane, keep logging. Entries are kept on your device and sent, once each, when the connection comes back."
    >
      <div ref={ref} aria-hidden className="flex flex-col gap-3">
        <div className={`${panel} flex items-center justify-between`}>
          <span className={cap}>Connection</span>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold text-sm transition-colors duration-500 ${
              offline ? "bg-destructive/15 text-destructive" : "bg-success-soft text-success"
            }`}
          >
            {offline ? <WifiOff className="size-4" /> : <Wifi className="size-4" />}
            {offline ? "Offline" : "Online"}
          </span>
        </div>
        <div className={`${panel} flex flex-col gap-2`}>
          <p className={cap}>Today</p>
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
            <span>Acme · Website</span>
            <span className="font-mono">3:00</span>
          </div>
          <div
            className={`flex items-center justify-between rounded-lg bg-amber/20 px-3 py-2 text-sm ring-1 ring-amber/50 ${fade(step >= 2)}`}
          >
            <span>Acme · Strategy</span>
            <span className="flex items-center gap-2">
              <span className="font-mono">1:30</span>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${
                  step >= 3 ? "bg-success-soft text-success" : "bg-muted text-foreground/75"
                }`}
              >
                {step >= 3 ? "sent" : "saved on this device"}
              </span>
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** A team member logs time on a client you gave them: it lands on your books with their name. */
function TeamScene() {
  const { ref, step } = useScene([900, 1200, 1500, 4000]);
  return (
    <Frame
      label="Animation: you invite Sam, Sam joins, logs two hours on Acme, and the hours appear in your timesheet with Sam's name."
      title="Let others log time for you"
      text="Invite someone to log time on only the clients you choose. Their hours land on your books, marked with their name, and they never see rates or invoices."
    >
      <div ref={ref} aria-hidden className="flex flex-col gap-3">
        <div className={`${panel} flex items-center gap-3`}>
          <span
            className={`grid size-10 place-items-center rounded-full bg-[#8A6CFF]/25 font-display font-extrabold transition-all duration-500 ${
              step >= 1 ? "scale-100 opacity-100" : "scale-75 opacity-40"
            }`}
          >
            S
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold font-display">Sam</span>
            <span className="block text-foreground/70 text-xs">logs time for Acme</span>
          </span>
          <span
            className={`rounded-full px-3 py-0.5 font-mono text-[11px] uppercase tracking-widest transition-colors duration-500 ${
              step >= 1 ? "bg-success-soft text-success" : "bg-amber/20"
            }`}
          >
            {step >= 1 ? "On the team" : "Waiting"}
          </span>
        </div>
        <div className={`${panel} ${fade(step >= 2)}`}>
          <p className={cap}>Sam logs</p>
          <p className="mt-1 font-semibold">2:00 · Acme · Website</p>
        </div>
        <div className={`${panel} flex flex-col gap-2`}>
          <p className={`${cap} flex justify-between`}>
            <span>Your timesheet</span>
            <span className="font-display font-extrabold text-base text-foreground normal-case tracking-normal">
              {step >= 3 ? "10:00" : "8:00"}
            </span>
          </p>
          <div className="flex justify-between rounded-lg bg-muted px-3 py-1.5 text-sm">
            <span>Acme · Strategy</span>
            <span className="font-mono">8:00</span>
          </div>
          <div
            className={`flex justify-between rounded-lg bg-amber/20 px-3 py-1.5 text-sm ring-1 ring-amber/50 ${fade(step >= 3)}`}
          >
            <span>Acme · Website · by Sam</span>
            <span className="font-mono">2:00</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** A budget filling: green, then yellow at 80%, then red when it is passed. */
function BudgetScene() {
  const { ref, step } = useScene([800, 1300, 1300, 4000]);
  const pct = [20, 62, 85, 108][step];
  const tone = step >= 3 ? "bg-destructive" : step === 2 ? "bg-amber" : "bg-success-bright";
  const words = ["on track", "on track", "nearly used up", "over budget"][step];
  return (
    <Frame
      label="Animation: a project budget bar fills as hours are logged, turns yellow at 80 percent and red when it is passed."
      title="Know before you go over"
      text="Give a project a budget in hours or money. The bar warns you at 80% and again when you pass it, so there are no surprises on the invoice."
    >
      <div ref={ref} aria-hidden className="flex flex-col gap-3">
        <div className={`${panel} flex flex-col gap-3`}>
          <p className={`${cap} flex justify-between`}>
            <span>Website · 40 h budget</span>
            <span className="font-display font-extrabold text-base text-foreground normal-case tracking-normal">
              {Math.round((pct / 100) * 40)} h
            </span>
          </p>
          <div className="h-4 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-[width,background-color] duration-1000 ease-out ${tone}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <p className="flex items-center gap-2 text-sm">
            {step >= 2 ? <Check className="size-4 opacity-0" /> : <Check className="size-4 text-success" />}
            Budget: {pct}% · <strong>{words}</strong>
          </p>
        </div>
        <div className={`${panel} text-foreground/75 text-sm`}>Days marked non-billable never count against it.</div>
      </div>
    </Frame>
  );
}

/** Four short scenes that explain the newer features, each playing as it scrolls into view. */
export function LandingScenes() {
  return (
    <ul className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-2">
      <SignOffScene />
      <OfflineScene />
      <TeamScene />
      <BudgetScene />
    </ul>
  );
}

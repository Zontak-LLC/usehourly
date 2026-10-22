"use client";

import { useState } from "react";

import { Eye, FileText, KeyRound, type LucideIcon, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EXPIRY_CHOICES, type ExpiryKey, type TokenAccess } from "@/lib/api-token";

const APP_NAMES = ["Claude Code", "Cursor", "Another app"];

const ACCESS: { id: TokenAccess; title: string; text: string; Badge: LucideIcon }[] = [
  { id: "read", title: "Read only", text: "It can look at your time, clients and invoices.", Badge: Eye },
  {
    id: "write",
    title: "Read and change",
    text: "It can also log time, start timers and make invoices.",
    Badge: PencilLine,
  },
];

/** A small picture of what the choice means: a page, with an eye on it (look) or a pencil on it (look and write). */
function AccessPicture({ Badge, on }: { Badge: LucideIcon; on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative grid size-12 shrink-0 place-items-center rounded-2xl transition-colors ${
        on ? "bg-foreground text-background" : "bg-muted text-foreground"
      }`}
    >
      <FileText className="size-6 opacity-70" strokeWidth={1.5} />
      <span
        className={`absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-full ring-2 ring-card ${
          on ? "bg-background text-foreground" : "bg-foreground text-background"
        }`}
      >
        <Badge className="size-3.5" strokeWidth={2.25} />
      </span>
    </span>
  );
}

const pill = (on: boolean) =>
  `min-h-10 rounded-full px-4 text-sm font-medium ring-1 transition-colors ${
    on ? "bg-foreground text-background ring-transparent" : "ring-foreground/15 hover:bg-muted"
  }`;

/**
 * The small form that makes a token: a name (with one-tap names for the usual apps), what the token may do as two
 * clear choices, how long it lives, and one button. It only collects the choices; the card around it makes the token.
 */
export function TokenForm({
  busy,
  onMake,
}: {
  busy: boolean;
  onMake: (v: { name: string; access: TokenAccess; expires: ExpiryKey }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [access, setAccess] = useState<TokenAccess>("read");
  const [expires, setExpires] = useState<ExpiryKey>("90d");

  return (
    <form
      method="post"
      className="grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onMake({ name, access, expires })) setName("");
      }}
    >
      <div className="grid gap-2">
        <label htmlFor="token-name" className="font-medium text-sm">
          What is it for?
        </label>
        <Input
          id="token-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Claude Code on my laptop"
          maxLength={60}
          required
        />
        <div className="flex flex-wrap gap-2">
          {APP_NAMES.map((n) => (
            <button key={n} type="button" onClick={() => setName(n)} className={pill(name === n)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
        <legend className="mb-2 font-medium text-sm">What may it do?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACCESS.map((a) => (
            <label
              key={a.id}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl p-3 ring-1 transition-colors has-[:focus-visible]:ring-2 ${
                access === a.id ? "bg-muted/60 ring-2 ring-foreground" : "ring-foreground/15 hover:bg-muted/60"
              }`}
            >
              <input
                type="radio"
                name="token-access"
                value={a.id}
                checked={access === a.id}
                onChange={() => setAccess(a.id)}
                className="sr-only"
              />
              <AccessPicture Badge={a.Badge} on={access === a.id} />
              <span className="grid min-w-0 gap-0.5">
                <span className="font-semibold text-sm">{a.title}</span>
                <span className="text-muted-foreground text-sm">{a.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
        <legend className="mb-2 font-medium text-sm">How long should it work?</legend>
        <div className="flex flex-wrap gap-2">
          {EXPIRY_CHOICES.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={expires === c.key}
              onClick={() => setExpires(c.key)}
              className={pill(expires === c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>

      <Button type="submit" variant="default" disabled={busy} className="h-12 justify-self-start px-6">
        <KeyRound className="size-4" aria-hidden />
        Make token
      </Button>
    </form>
  );
}

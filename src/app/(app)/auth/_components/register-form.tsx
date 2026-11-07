"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Cloudflare's robot check. It draws nothing unless the site has a key, and reports its token through `onToken`. */
function RobotCheck({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widget: string | undefined;
    function draw() {
      const api = window.turnstile;
      if (!api || !box.current || widget !== undefined) return;
      widget = api.render(box.current, {
        sitekey: siteKey,
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    if (existing) {
      if (window.turnstile) draw();
      else existing.addEventListener("load", draw);
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.dataset.turnstile = "1";
      script.addEventListener("load", draw);
      document.head.appendChild(script);
    }
  }, [siteKey, onToken]);
  return <div ref={box} />;
}

export function RegisterForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const register = trpc.account.register.useMutation();
  const check = trpc.account.signupCheck.useQuery();
  const siteKey = check.data?.siteKey ?? null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    setPending(true);
    try {
      await register.mutateAsync({
        name: String(fd.get("name")),
        email,
        password,
        website: String(fd.get("website") ?? ""),
        captcha,
      });
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        toast.error("Account created, but automatic login failed. Please log in.");
        router.replace("/auth/v2/login");
        return;
      }
      router.replace("/dashboard/today");
      router.refresh();
    } catch (err) {
      toastError(err, "Couldn't create your account.");
      // A robot-check token works once; get a fresh one for the next try.
      window.turnstile?.reset();
      setCaptcha("");
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" autoComplete="name" autoFocus required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <p className="text-muted-foreground text-xs">At least 8 characters.</p>
      </div>
      {/* A trap for scripts: people never see or fill this box. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {siteKey && <RobotCheck siteKey={siteKey} onToken={setCaptcha} />}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="h-11 text-base"
        disabled={pending || (siteKey !== null && captcha === "")}
      >
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

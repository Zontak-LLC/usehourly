"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/safe-next";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // Said under the password field, where the eyes are (issue 219), not only in a toast that disappears.
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = await signIn("credentials", {
        email: String(fd.get("email")),
        password: String(fd.get("password")),
        redirect: false,
      });
      if (res?.error || !res?.ok) {
        setError("Wrong email or password.");
        return;
      }
      router.replace(safeNext(new URLSearchParams(window.location.search).get("next")));
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
        {error && (
          <p id="login-error" role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" variant="primary" size="lg" className="h-11 text-base" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <Link
        href="/auth/v2/forgot-password"
        prefetch={false}
        className="block py-2 text-center text-muted-foreground text-sm underline"
      >
        Forgot your password?
      </Link>
    </form>
  );
}

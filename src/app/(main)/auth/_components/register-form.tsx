"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

export function RegisterForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const register = trpc.account.register.useMutation();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    setPending(true);
    try {
      await register.mutateAsync({ name: String(fd.get("name")), email, password });
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        toast.error("Account created, but automatic login failed. Please log in.");
        router.replace("/auth/v2/login");
        return;
      }
      router.replace("/dashboard/today");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create your account.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

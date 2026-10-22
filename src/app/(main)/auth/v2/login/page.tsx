import Link from "next/link";

import type { Metadata } from "next";

import { SocialSignIn } from "@/components/social-sign-in";
import { TryDemoButton } from "@/components/try-demo-button";

import { LoginForm } from "../../_components/login-form";

export const metadata: Metadata = { title: "Log in · UseHourly" };

export default function LoginPage() {
  return (
    <>
      <div className="relative mx-auto flex w-full flex-col justify-center space-y-6 rounded-3xl border bg-card p-6 shadow-[var(--shadow-sheet)] sm:w-[420px] sm:p-8">
        <div className="space-y-2 text-center">
          <h1 className="font-bold font-display text-4xl">Welcome back</h1>
          <p className="text-muted-foreground text-sm">Log in to track your time.</p>
        </div>
        <SocialSignIn />
        <LoginForm />
        <div className="text-center text-muted-foreground text-sm">
          Just looking?
          <TryDemoButton className="ml-1 inline-block py-2 text-foreground underline underline-offset-4">
            Try the demo first
          </TryDemoButton>
        </div>
      </div>
      <div className="absolute top-5 flex w-full justify-end px-10 text-muted-foreground text-sm">
        <span>
          New here?{" "}
          <Link prefetch={false} className="inline-block py-2 text-foreground" href="/auth/v2/register">
            Create an account
          </Link>
        </span>
      </div>
    </>
  );
}

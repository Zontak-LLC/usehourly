import Link from "next/link";

import type { Metadata } from "next";

import { SocialSignIn } from "@/components/social-sign-in";
import { TryDemoButton } from "@/components/try-demo-button";

import { LoginForm } from "../../_components/login-form";

export const metadata: Metadata = { title: "Log in · UseHourly" };

export default function LoginPage() {
  return (
    <>
      <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
        <div className="space-y-2 text-center">
          <h1 className="font-medium text-3xl">Welcome back</h1>
          <p className="text-muted-foreground text-sm">Log in to track your time.</p>
        </div>
        <SocialSignIn />
        <LoginForm />
        <div className="text-center text-muted-foreground text-sm">
          Just looking?
          <TryDemoButton className="ml-1 text-foreground underline underline-offset-4">
            Try the demo first
          </TryDemoButton>
        </div>
      </div>
      <div className="absolute top-5 flex w-full justify-end px-10 text-muted-foreground text-sm">
        <span>
          New here?{" "}
          <Link prefetch={false} className="text-foreground" href="/auth/v2/register">
            Create an account
          </Link>
        </span>
      </div>
    </>
  );
}

import type { Metadata } from "next";

import { SocialSignIn } from "@/components/social-sign-in";
import { TryDemoButton } from "@/components/try-demo-button";

import { RegisterForm } from "../../_components/register-form";

export const metadata: Metadata = { title: "Create account · UseHourly" };

export default function RegisterPage() {
  return (
    <div className="relative mx-auto flex w-full flex-col justify-center space-y-6 rounded-3xl border bg-card p-6 shadow-[var(--shadow-sheet)] sm:w-[420px] sm:p-8">
      <div className="space-y-2 text-center">
        <h1 className="font-bold font-display text-4xl">Create your account</h1>
        <p className="text-muted-foreground text-sm">Free to use. No paywall, no ads.</p>
      </div>
      <SocialSignIn />
      <RegisterForm />
      <div className="text-center text-muted-foreground text-sm">
        Just looking?
        <TryDemoButton className="ml-1 inline-block py-2 text-foreground underline underline-offset-4">
          Try the demo first
        </TryDemoButton>
      </div>
    </div>
  );
}

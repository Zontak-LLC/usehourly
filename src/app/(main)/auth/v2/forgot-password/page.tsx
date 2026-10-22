import Link from "next/link";

import type { Metadata } from "next";

import { ForgotPasswordForm } from "../../_components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password · UseHourly" };

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="relative mx-auto flex w-full flex-col justify-center space-y-6 rounded-3xl border bg-card p-6 shadow-[var(--shadow-sheet)] sm:w-[420px] sm:p-8">
        <div className="space-y-2 text-center">
          <h1 className="font-bold font-display text-4xl">Forgot your password?</h1>
          <p className="text-muted-foreground text-sm">Enter your email and we will send you a link.</p>
        </div>
        <ForgotPasswordForm />
      </div>
      <div className="absolute top-5 flex w-full justify-end px-10 text-muted-foreground text-sm">
        <Link prefetch={false} className="text-foreground" href="/auth/v2/login">
          Back to log in
        </Link>
      </div>
    </>
  );
}

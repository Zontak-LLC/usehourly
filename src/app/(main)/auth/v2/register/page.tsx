import Link from "next/link";

import type { Metadata } from "next";

import { RegisterForm } from "../../_components/register-form";

export const metadata: Metadata = { title: "Create account · Hourly" };

export default function RegisterPage() {
  return (
    <>
      <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
        <div className="space-y-2 text-center">
          <h1 className="font-medium text-3xl">Create your account</h1>
          <p className="text-muted-foreground text-sm">Free to use. No paywall, no ads.</p>
        </div>
        <RegisterForm />
      </div>
      <div className="absolute top-5 flex w-full justify-end px-10 text-muted-foreground text-sm">
        <span>
          Already have an account?{" "}
          <Link prefetch={false} className="text-foreground" href="/auth/v2/login">
            Log in
          </Link>
        </span>
      </div>
    </>
  );
}

import type { Metadata } from "next";

import { CenteredCard } from "@/components/centered-card";

import { VerifyEmail } from "./verify-email";

export const metadata: Metadata = { title: "Confirm your email · UseHourly", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <CenteredCard title="Confirm your email">
      <VerifyEmail token={token ?? ""} />
    </CenteredCard>
  );
}

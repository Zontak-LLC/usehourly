import type { Metadata } from "next";

import { CenteredCard } from "@/components/centered-card";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password · UseHourly", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <CenteredCard title="Choose a new password">
      <ResetPasswordForm token={token ?? ""} />
    </CenteredCard>
  );
}

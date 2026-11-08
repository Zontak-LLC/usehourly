import { notFound } from "next/navigation";

import type { Metadata } from "next";

import { feature } from "@/lib/features";

import { JoinView } from "./join-view";

export const metadata: Metadata = {
  title: "Join a team | UseHourly",
  robots: { index: false },
  referrer: "no-referrer",
};

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  if (!feature("team")) notFound();
  const { token } = await params;
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto max-w-md px-6 py-16">
        <JoinView token={token} />
      </main>
    </div>
  );
}

import { notFound } from "next/navigation";

import type { Metadata } from "next";

import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { isAdminAccount } from "@/server/admin-access";

import { InsightsView } from "./_components/insights-view";

export const metadata: Metadata = { title: "Insights · UseHourly" };

/** Owner only. Anyone else gets the ordinary "not found" page, so the page's existence is not revealed. */
export default async function InsightsPage() {
  const session = await auth();
  if (!session?.user?.id || !(await isAdminAccount(await getPrisma(), session.user.id))) notFound();
  return <InsightsView />;
}

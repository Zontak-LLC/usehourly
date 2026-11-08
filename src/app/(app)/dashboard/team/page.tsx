import { notFound } from "next/navigation";

import type { Metadata } from "next";

import { feature } from "@/lib/features";

import { TeamView } from "./_components/team-view";

export const metadata: Metadata = { title: "Team · UseHourly" };

export default function TeamPage() {
  if (!feature("team")) notFound();
  return <TeamView />;
}

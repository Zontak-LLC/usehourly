import type { Metadata } from "next";

import { TeamView } from "./_components/team-view";

export const metadata: Metadata = { title: "Team · UseHourly" };

export default function TeamPage() {
  return <TeamView />;
}

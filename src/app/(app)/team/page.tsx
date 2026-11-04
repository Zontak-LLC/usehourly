import { notFound, redirect } from "next/navigation";

import { feature } from "@/lib/features";

/** /team is not a page of its own (the Team page lives in the app, and /team/join/<token> is the invitation page): send people to the app's. */
export default function TeamRedirect() {
  if (!feature("team")) notFound();
  redirect("/dashboard/team");
}

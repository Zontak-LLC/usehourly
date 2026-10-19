import { redirect } from "next/navigation";

/** /team is not a page of its own (the Team page lives in the app, and /team/join/<token> is the invitation page): send people to the app's. */
export default function TeamRedirect() {
  redirect("/dashboard/team");
}

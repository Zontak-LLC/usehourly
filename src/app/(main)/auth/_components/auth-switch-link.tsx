"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The link at the top right of a sign-in page: to the other form, or back to logging in. */
export function AuthSwitchLink() {
  const path = usePathname();
  const [lead, label, href] = path.startsWith("/auth/v2/register")
    ? ["Already have an account?", "Log in", "/auth/v2/login"]
    : path.startsWith("/auth/v2/login")
      ? ["New here?", "Create an account", "/auth/v2/register"]
      : [null, "Back to log in", "/auth/v2/login"];
  return (
    <span className="whitespace-nowrap text-muted-foreground text-sm">
      {/* On a phone only the link shows, so it never runs into the logo. */}
      {lead && <span className="max-sm:hidden">{lead} </span>}
      <Link prefetch={false} className="inline-block py-2 font-medium text-foreground" href={href}>
        {label}
      </Link>
    </span>
  );
}

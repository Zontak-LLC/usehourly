"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    // Side padding so the sentence never runs to a phone's edges (walkthrough 2026-10-25); one link, not a button
    // inside a link.
    <div className="flex h-dvh flex-col items-center justify-center space-y-2 px-4 text-center">
      <h1 className="font-semibold text-2xl">Page not found.</h1>
      <p className="max-w-md text-muted-foreground">The page you are looking for could not be found.</p>
      <Button asChild variant="outline">
        <Link prefetch={false} replace href="/dashboard/today">
          Go to Today
        </Link>
      </Button>
    </div>
  );
}

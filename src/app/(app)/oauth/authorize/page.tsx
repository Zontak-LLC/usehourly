import { Suspense } from "react";

import type { Metadata } from "next";

import { AuthorizeView } from "./authorize-view";

export const metadata: Metadata = { title: "Connect an app | UseHourly", robots: { index: false } };

export default function AuthorizePage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto max-w-md px-6 py-16">
        <Suspense fallback={<p className="text-muted-foreground">One moment…</p>}>
          <AuthorizeView />
        </Suspense>
      </main>
    </div>
  );
}

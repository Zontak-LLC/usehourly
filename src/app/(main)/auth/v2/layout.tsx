import type { ReactNode } from "react";

// Just the form, centered. (The branded side panel was removed on purpose: the page is for logging in.)
export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main>
      <div className="relative flex min-h-dvh items-center justify-center p-2 py-20">{children}</div>
    </main>
  );
}

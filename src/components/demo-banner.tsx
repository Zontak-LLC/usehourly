import Link from "next/link";

/** Shown above the app while a visitor is in the demo. */
export function DemoBanner() {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b bg-card px-4 py-2 text-center text-foreground text-sm"
    >
      <span>
        <strong>You&rsquo;re trying the demo.</strong> This is sample data, and it is deleted after 24 hours.
      </span>
      <Link href="/dashboard/account#claim" className="inline-block py-1 font-medium underline underline-offset-2">
        Keep your work: create a free account
      </Link>
    </div>
  );
}

import Link from "next/link";

/** Shown above the app while a visitor is in the demo. */
export function DemoBanner() {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b bg-amber-100 px-4 py-2 text-center text-amber-950 text-sm dark:bg-amber-900/40 dark:text-amber-100"
    >
      <span>
        <strong>You&rsquo;re trying the demo.</strong> This is sample data, and it is deleted after 24 hours.
      </span>
      <Link href="/dashboard/account#claim" className="font-medium underline underline-offset-2">
        Keep your work: create a free account
      </Link>
    </div>
  );
}

import Link from "next/link";

/** Shown above the app while a visitor is in the demo. One line on a phone too (issue 217): shorter words there. */
export function DemoBanner() {
  return (
    <div
      role="status"
      data-testid="demo-banner"
      className="flex items-center justify-center gap-x-3 border-b bg-card px-4 py-1 text-center text-foreground text-sm max-sm:gap-x-2 max-sm:whitespace-nowrap max-sm:px-3 max-sm:text-xs"
    >
      <span className="min-w-0 truncate">
        <strong>
          <span className="sm:hidden">Demo:</span>
          <span className="max-sm:hidden">You&rsquo;re trying the demo.</span>
        </strong>{" "}
        <span className="sm:hidden">sample data, deleted after 24 hours.</span>
        <span className="max-sm:hidden">This is sample data, and it is deleted after 24 hours.</span>
      </span>
      <Link
        href="/dashboard/account#claim"
        className="inline-block shrink-0 py-2 font-medium underline underline-offset-2"
      >
        <span className="sm:hidden">Keep it</span>
        <span className="max-sm:hidden">Keep your work: create a free account</span>
      </Link>
    </div>
  );
}

import { CircleHelp } from "lucide-react";

/**
 * A small "?" that opens a guide topic in a new tab (so a form being filled in is not lost). Put it next to a setting
 * that is easy to misunderstand. `topic` must be a guide slug: a test checks every one used in the app exists.
 */
export function GuideLink({ topic, label }: { topic: string; label: string }) {
  return (
    <a
      href={`/help/${topic}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Guide: ${label}`}
      title={`Guide: ${label}`}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <CircleHelp className="size-4" aria-hidden />
    </a>
  );
}

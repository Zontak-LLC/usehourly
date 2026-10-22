import { Heart } from "lucide-react";

import { SUPPORTERS } from "@/lib/supporters";

/** A thank-you to the people who sponsor UseHourly. Renders nothing until there is someone to thank. */
export function Supporters() {
  if (SUPPORTERS.length === 0) return null;
  return (
    <section className="border-t bg-[#8A6CFF]/5" aria-labelledby="supporters-heading">
      <div className="mx-auto max-w-3xl px-6 py-14 text-center md:py-16">
        <Heart className="mx-auto size-6 text-rose-500" aria-hidden />
        <h2 id="supporters-heading" className="mt-3 font-semibold text-2xl tracking-tight">
          Thank you to our supporters
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
          These people help keep UseHourly free for everyone.
        </p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {SUPPORTERS.map((s) => (
            <li key={s.name}>
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-full border bg-background px-4 py-2 font-medium text-sm hover:bg-muted"
                >
                  {s.name}
                </a>
              ) : (
                <span className="inline-block rounded-full border bg-background px-4 py-2 font-medium text-sm">
                  {s.name}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

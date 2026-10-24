"use client";

import * as React from "react";
import { cn } from "cn";
import { X } from "lucide-react";

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Empties a text box the way typing would: the value is set through the element's own setter (so React's change
 * tracking sees a real change) and an `input` event is sent, so `onChange`, react state and form libraries all hear
 * it, controlled or not. Then the box gets the focus back, ready to type in.
 */
export function clearField(el: Field) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, "");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
}

/**
 * The round × inside the right edge of a text box (the same look as the Log time field's, issue 220). It is a real
 * button named "Clear" (not "Clear <field name>": a name that contains the field's label would make the label find two
 * things), so a keyboard can reach it too.
 */
export function ClearFieldButton({
  onClear,
  className,
  label = "Clear",
}: {
  onClear: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-slot="clear-field"
      // Keep the focus in the box while the mouse is down, so a blur handler does not run before the clear.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClear}
      className={cn(
        "absolute right-1 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        className,
      )}
    >
      <span className="grid size-5 place-items-center rounded-full bg-foreground/10">
        <X className="size-3" strokeWidth={3} aria-hidden />
      </span>
    </button>
  );
}

/**
 * Whether a clearable box holds text, for controlled boxes (from `value`) and uncontrolled ones (read from the element
 * after each render and on each `input` event), plus the ref to put on the element.
 */
export function useClearable<T extends Field>(
  value: React.ComponentProps<"input">["value"],
  forwarded: React.Ref<T> | undefined,
) {
  const inner = React.useRef<T | null>(null);
  const [typed, setTyped] = React.useState(false);
  const controlled = value !== undefined;

  React.useEffect(() => {
    const el = inner.current;
    if (!controlled && el) setTyped(el.value !== "");
  });

  const ref = React.useCallback(
    (el: T | null) => {
      inner.current = el;
      if (typeof forwarded === "function") forwarded(el);
      else if (forwarded) (forwarded as React.RefObject<T | null>).current = el;
    },
    [forwarded],
  );

  const filled = controlled ? String(value ?? "") !== "" : typed;
  const onInput = (e: React.FormEvent<T>) => setTyped(e.currentTarget.value !== "");
  const clear = () => {
    if (inner.current) clearField(inner.current);
  };
  return { ref, filled, onInput, clear };
}

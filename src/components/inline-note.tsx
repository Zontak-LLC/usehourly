"use client";

import { useEffect, useRef, useState } from "react";

import { Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useOptimisticEntries } from "@/components/use-optimistic-entries";
import { NOTE_MAX } from "@/lib/notes";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** Asks the list row of entry `id` to open its note box (the day card's "Add notes" uses it). */
export const OPEN_NOTE_EVENT = "hourly:open-note";
/** Sent after a note was saved from a row with Enter, so "Add notes" can move on to the next entry. */
export const NOTE_SAVED_EVENT = "hourly:note-saved";

export function openNote(id: string) {
  window.dispatchEvent(new CustomEvent<string>(OPEN_NOTE_EVENT, { detail: id }));
}

/**
 * Saves a note onto an entry that already exists (no new entry): shown at once, confirmed by the server with the
 * normal `entry.update`, taken back if the server refuses. Used by the Log time form's follow-up box and every row.
 */
export function useSaveNote() {
  const utils = trpc.useUtils();
  const optimistic = useOptimisticEntries();
  return async (id: string, note: string): Promise<boolean> => {
    const undo = await optimistic.patch(id, { note });
    try {
      // The plain client: the row or form that asked may have moved on by the time the answer comes.
      await utils.client.entry.update.mutate({ id, note });
      await utils.entry.list.invalidate();
      return true;
    } catch (err) {
      undo();
      toastError(err, "Couldn't save that note.");
      return false;
    }
  };
}

/**
 * The ONE "+ Add note" of every entries list (Today, Week, Month): a real button under the entry's name that turns
 * into a text box in the row. Enter saves, Escape cancels, leaving the box saves what was typed. No edit form.
 */
export function InlineNote({ entryId, label }: { entryId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false); // set by Enter or Escape, so the blur that follows does not save a second time
  const save = useSaveNote();

  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== entryId) return;
      setOpen(true);
    };
    window.addEventListener(OPEN_NOTE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_NOTE_EVENT, onOpen);
  }, [entryId]);

  useEffect(() => {
    if (!open) return;
    done.current = false;
    inputRef.current?.focus({ preventScroll: false });
    inputRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  async function finish(how: "enter" | "blur") {
    const note = text.trim();
    setOpen(false);
    setText("");
    if (!note) return;
    const ok = await save(entryId, note);
    if (ok && how === "enter") window.dispatchEvent(new CustomEvent<string>(NOTE_SAVED_EVENT, { detail: entryId }));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Add a note to ${label}`}
        className="inline-flex min-h-7 items-center gap-1 rounded-md font-medium text-amber text-sm hover:underline"
      >
        <Plus aria-hidden className="size-3.5" strokeWidth={2.5} />
        Add note
      </button>
    );
  }
  return (
    <Input
      ref={inputRef}
      value={text}
      maxLength={NOTE_MAX}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          done.current = true;
          void finish("enter");
        }
        if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          setOpen(false);
          setText("");
        }
      }}
      onBlur={() => {
        if (!done.current) void finish("blur");
      }}
      aria-label={`Note for ${label}`}
      placeholder="What did you work on? Enter saves it."
      enterKeyHint="done"
    />
  );
}

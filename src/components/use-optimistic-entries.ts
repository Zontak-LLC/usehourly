"use client";

import { useCallback } from "react";

import { useQueryClient } from "@tanstack/react-query";

import {
  addEntry,
  type EntryListItem,
  patchEntry,
  rangeOfKey,
  removeEntry,
  withNonBillableDay,
} from "@/lib/optimistic-entries";

const ENTRY_LISTS = [["entry", "list"]];
const MARKED_DAYS = [["entry", "nonBillableDays"]];

/** Puts everything back as it was. Called when the server refuses the change. */
export type Undo = () => void;

/**
 * Show a change on screen BEFORE the server confirms it, in every loaded list it belongs in (the day, the week and the
 * month a screen may be holding), and hand back the way to take it back if the server says no. The caller still sends
 * the change and refreshes the lists afterwards (that is what makes the screen exact again); this only closes the gap
 * between the tap and the answer. Nothing here touches the server.
 */
export function useOptimisticEntries() {
  const queryClient = useQueryClient();

  const apply = useCallback(
    async (change: (rows: EntryListItem[], range: { from: string; to: string }) => EntryListItem[]): Promise<Undo> => {
      // A fetch already on its way would land after this and put the old rows back.
      await queryClient.cancelQueries({ queryKey: ENTRY_LISTS });
      const before = queryClient.getQueriesData<EntryListItem[]>({ queryKey: ENTRY_LISTS });
      for (const [key, rows] of before) {
        const range = rangeOfKey(key);
        if (rows && range) queryClient.setQueryData(key, change(rows, range));
      }
      return () => {
        for (const [key, rows] of before) queryClient.setQueryData(key, rows);
      };
    },
    [queryClient],
  );

  const add = useCallback((row: EntryListItem) => apply((rows, range) => addEntry(rows, range, row)), [apply]);
  const patch = useCallback(
    (id: string, changes: Partial<EntryListItem>) => apply((rows, range) => patchEntry(rows, range, id, changes)),
    [apply],
  );
  const remove = useCallback((id: string) => apply((rows) => removeEntry(rows, id)), [apply]);

  /** Marks or un-marks a day non-billable on screen: the marked-days lists and the flag on that day's entries. */
  const markDay = useCallback(
    async (date: string, on: boolean): Promise<Undo> => {
      await queryClient.cancelQueries({ queryKey: MARKED_DAYS });
      const days = queryClient.getQueriesData<string[]>({ queryKey: MARKED_DAYS });
      for (const [key, list] of days) {
        const range = rangeOfKey(key);
        if (list && range) queryClient.setQueryData(key, withNonBillableDay(list, range, date, on));
      }
      const undoEntries = await apply((rows) =>
        rows.some((r) => r.date === date) ? rows.map((r) => (r.date === date ? { ...r, non_billable: on } : r)) : rows,
      );
      return () => {
        for (const [key, list] of days) queryClient.setQueryData(key, list);
        undoEntries();
      };
    },
    [queryClient, apply],
  );

  return { add, patch, remove, markDay };
}

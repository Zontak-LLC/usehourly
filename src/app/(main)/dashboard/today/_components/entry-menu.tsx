"use client";

import { CalendarArrowUp, MoreHorizontal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The entry card's rarer actions behind one "More actions" button (UI simplification, ticket #135): Move to another day
 * and Delete. Edit is the common action and stays a visible button in the card's header. The menu only lists them; the
 * card owns what they do.
 */
export function EntryMenu({
  disabled,
  deleteDisabled,
  onMove,
  onDelete,
}: {
  /** Move needs a confirmed, not-running entry. */
  disabled?: boolean;
  deleteDisabled?: boolean;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline" aria-label="More actions" title="More actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem disabled={disabled} onSelect={onMove}>
          <CalendarArrowUp /> Move to another day
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" disabled={deleteDisabled} onSelect={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

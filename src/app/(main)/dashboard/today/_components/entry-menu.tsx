"use client";

import { CalendarArrowUp, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * An entry's actions behind one "More actions" button (UI simplification, ticket #135): Edit, Move to another day and
 * Delete used to be three icon buttons in every card header. The menu only lists them; the card owns what they do.
 */
export function EntryMenu({
  disabled,
  deleteDisabled,
  onEdit,
  onMove,
  onDelete,
}: {
  /** Edit and Move need a confirmed, not-running entry. */
  disabled?: boolean;
  deleteDisabled?: boolean;
  onEdit: () => void;
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
        <DropdownMenuItem disabled={disabled} onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
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

"use client";

import type { ReactNode } from "react";

import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MoreMenuItem = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** Red, for removing or archiving. */
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * The ··· button that holds an item's secondary actions (docs/ui-spec.md: three or more, or two on a card that repeats
 * in a list). `label` names the button for a screen reader and says whose actions they are ("More actions for Acme").
 */
export function MoreMenu({ label, items }: { label: string; items: MoreMenuItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline" aria-label={label} title="More actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            variant={item.destructive ? "destructive" : "default"}
            disabled={item.disabled}
            onSelect={item.onSelect}
          >
            {item.icon} {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

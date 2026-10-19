"use client";

import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Icon colours by what the action does (the icon only, never the label words, so text contrast is unchanged). */
export const ICON_TONE = {
  edit: "text-sky-600 dark:text-sky-400",
  send: "text-sky-600 dark:text-sky-400",
  archive: "text-amber-600 dark:text-amber-400",
} as const;

/** An icon button with a real tooltip (the native title attribute is slow and never shows on touch). */
export function IconAction({
  label,
  tip,
  className,
  disabled,
  onClick,
  text,
  children,
}: {
  label: string;
  tip: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  /** Visible words under the icon (the phone's action row); without it the button is icon-only with a tooltip. */
  text?: string;
  children: React.ReactNode;
}) {
  const button = (
    <Button
      size={text ? "default" : "icon"}
      variant="outline"
      aria-label={label}
      className={cn(text && "h-auto min-h-12 flex-1 flex-col gap-0.5 px-1 py-1.5 text-xs", className)}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      {text}
    </Button>
  );
  if (text) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

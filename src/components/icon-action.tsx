"use client";

import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** An icon button with a real tooltip (the native title attribute is slow and never shows on touch). */
export function IconAction({
  label,
  tip,
  className,
  disabled,
  onClick,
  expanded,
  text,
  children,
}: {
  label: string;
  tip: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  /** For a button that opens something (a form) and closes it on the next click: whether it is open now. */
  expanded?: boolean;
  /** Visible words under the icon (the phone's action row); without it the button is icon-only with a tooltip. */
  text?: string;
  children: React.ReactNode;
}) {
  const button = (
    <Button
      size={text ? "default" : "icon"}
      variant="outline"
      aria-label={label}
      aria-expanded={expanded}
      className={cn(text && "h-auto min-h-12 flex-1 flex-col gap-0.5 px-1 py-2 text-xs", className)}
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

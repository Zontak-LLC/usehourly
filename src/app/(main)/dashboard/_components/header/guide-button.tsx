import Link from "next/link";

import { CircleHelp } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

/** Top-right link to the guide and FAQ, beside the settings gear. */
export function GuideButton() {
  return (
    <Link
      href="/help"
      prefetch={false}
      aria-label="Guide and FAQ"
      title="Guide and FAQ"
      className={buttonVariants({ variant: "outline", size: "icon" })}
    >
      <CircleHelp />
    </Link>
  );
}

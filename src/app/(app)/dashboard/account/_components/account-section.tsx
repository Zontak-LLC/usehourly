import type { inferRouterOutputs } from "@trpc/server";

import { SectionGroupProvider } from "@/components/section-card";
import { SplitPane } from "@/components/split-view";
import type { AccountSectionId } from "@/lib/account-sections";
import type { AppRouter } from "@/server/routers/_app";

type Outputs = inferRouterOutputs<AppRouter>;

export type AccountMe = Outputs["account"]["me"];
export type EmailEnabled = Outputs["account"]["emailEnabled"] | undefined;

/**
 * One section per topic: a big display heading and a line under it, then the cards of that topic as soft white sheets
 * (rings, not borders, so the page's nesting rule holds). They find out they are in a section through SectionGroupProvider.
 */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: AccountSectionId;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <SplitPane id={id} title={title} description={description}>
      <SectionGroupProvider value>
        {/* The page is as wide as the others, but a text box stays a comfortable length: fields stop at 28rem. */}
        <div className="flex flex-col gap-4 [&_input:not([type=checkbox]):not([type=radio]):not([type=file])]:max-w-md [&_select]:max-w-md [&_textarea]:max-w-md">
          {children}
        </div>
      </SectionGroupProvider>
    </SplitPane>
  );
}

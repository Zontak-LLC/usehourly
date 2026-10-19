import Link from "next/link";

import type { Metadata } from "next";

import { GuideBody } from "@/components/guide/guide-body";
import { FAQ } from "@/content/guide";

export const metadata: Metadata = {
  title: "FAQ · UseHourly",
  description: "Short answers to common questions about UseHourly.",
};

export default function FaqPage() {
  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/help" prefetch={false} className="text-muted-foreground underline underline-offset-4">
          Guide
        </Link>
      </p>
      <h1 className="font-semibold text-3xl tracking-tight">FAQ</h1>
      <div className="mt-6 flex flex-col gap-3">
        {FAQ.map((item) => (
          <section key={item.id} id={item.id} className="scroll-mt-6 rounded-xl border bg-card p-4">
            <h2 className="mb-2 font-semibold text-base">{item.question}</h2>
            <GuideBody markdown={item.answer} />
          </section>
        ))}
      </div>
    </>
  );
}

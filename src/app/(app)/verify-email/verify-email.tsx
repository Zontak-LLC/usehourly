"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { Notice } from "@/components/notice";
import { trpc } from "@/lib/trpc";

/** Confirms the address as soon as the page opens, then says so (or says why not). */
export function VerifyEmail({ token }: { token: string }) {
  const verify = trpc.account.verifyEmail.useMutation();
  const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");
  const [message, setMessage] = useState(token ? "" : "This page needs the link from your email.");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verify
      .mutateAsync({ token })
      .then(() => setState("done"))
      .catch((err) => {
        setState("failed");
        setMessage(err instanceof Error ? err.message : "Couldn't confirm your email.");
      });
  }, [token, verify]);

  return (
    <div className="space-y-4">
      <Notice className="p-4">
        {state === "working" && "Confirming your email…"}
        {state === "done" && "Thank you. Your email address is confirmed."}
        {state === "failed" && message}
      </Notice>
      <Link className="block text-center text-sm underline" href="/dashboard/account">
        Go to your account
      </Link>
    </div>
  );
}

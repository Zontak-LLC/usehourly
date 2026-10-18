"use client";

import { useEffect, useState } from "react";

import { Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

function clock(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TimerBanner() {
  const utils = trpc.useUtils();
  const running = trpc.entry.running.useQuery();
  const stop = trpc.entry.stop.useMutation();
  const [now, setNow] = useState(() => Date.now());

  const active = !!running.data?.started_at;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!running.data?.started_at) return;
    const prev = document.title;
    document.title = `⏱ ${running.data.project.name} · UseHourly`;
    return () => {
      document.title = prev;
    };
  }, [running.data]);

  if (!running.data?.started_at) return null;
  const entry = running.data;
  const elapsed = Math.max(0, Math.floor((now - new Date(running.data.started_at).getTime()) / 1000));

  async function onStop() {
    try {
      await stop.mutateAsync();
      await Promise.all([utils.entry.running.invalidate(), utils.entry.list.invalidate()]);
    } catch (err) {
      toastError(err, "Couldn't stop the timer.");
    }
  }

  return (
    <div className="sticky top-28 z-30 flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-background px-4 py-3 shadow-sm md:top-2">
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">
          {entry.project.client.name} · {entry.project.name}
        </p>
        {entry.note && <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs">{entry.note}</p>}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-lg tabular-nums">{clock(elapsed)}</span>
        <Button size="lg" className="h-11" variant="destructive" onClick={onStop} disabled={stop.isPending}>
          <Square /> Stop
        </Button>
      </div>
    </div>
  );
}

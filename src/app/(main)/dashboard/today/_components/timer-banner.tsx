"use client";

import { useEffect, useState } from "react";

import { Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  const elapsed = Math.max(0, Math.floor((now - new Date(entry.started_at as unknown as string).getTime()) / 1000));

  async function onStop() {
    try {
      await stop.mutateAsync();
      await Promise.all([utils.entry.running.invalidate(), utils.entry.list.invalidate()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't stop the timer.");
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">
          {entry.project.client.name} · {entry.project.name}
        </p>
        {entry.note && <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs">{entry.note}</p>}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-lg tabular-nums">{clock(elapsed)}</span>
        <Button size="sm" variant="destructive" onClick={onStop} disabled={stop.isPending}>
          <Square /> Stop
        </Button>
      </div>
    </div>
  );
}

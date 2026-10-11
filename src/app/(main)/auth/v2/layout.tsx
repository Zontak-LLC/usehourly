import type { ReactNode } from "react";

import { Clock } from "lucide-react";

import { APP_CONFIG } from "@/config/app-config";

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main>
      <div className="grid h-dvh justify-center p-2 lg:grid-cols-2">
        <div className="relative order-2 hidden h-full rounded-3xl bg-primary lg:flex">
          <div className="absolute top-10 space-y-1 px-10 text-primary-foreground">
            <Clock className="size-10" />
            <h1 className="font-medium text-2xl">{APP_CONFIG.name}</h1>
            <p className="text-sm">Log your day in seconds.</p>
          </div>
          <div className="absolute bottom-10 space-y-1 px-10 text-primary-foreground">
            <p className="text-sm">Type “1.5”, “1:30” or “90m”. Press Enter. Done.</p>
          </div>
        </div>
        <div className="relative order-1 flex h-full">{children}</div>
      </div>
    </main>
  );
}

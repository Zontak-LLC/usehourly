import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/server/routers/_app";

export type ClientRow = inferRouterOutputs<AppRouter>["clients"]["list"][number];
export type ProjectRow = ClientRow["projects"][number];
export type ProjectBudgets = inferRouterOutputs<AppRouter>["project"]["budgets"];
export type ProjectTotals = inferRouterOutputs<AppRouter>["project"]["totals"];

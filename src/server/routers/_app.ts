import { router } from "../trpc";
import { accountRouter } from "./account";
import { clientRouter } from "./client";
import { entryRouter } from "./entry";
import { invoiceRouter } from "./invoice";
import { projectRouter } from "./project";
import { reportRouter } from "./report";

export const appRouter = router({
  account: accountRouter,
  clients: clientRouter,
  project: projectRouter,
  entry: entryRouter,
  invoice: invoiceRouter,
  report: reportRouter,
});

export type AppRouter = typeof appRouter;

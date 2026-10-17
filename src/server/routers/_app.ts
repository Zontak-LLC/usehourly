import { router } from "../trpc";
import { accountRouter } from "./account";
import { clientRouter } from "./client";
import { entryRouter } from "./entry";
import { invoiceRouter } from "./invoice";
import { oauthRouter } from "./oauth";
import { projectRouter } from "./project";
import { reportRouter } from "./report";
import { timeImportRouter } from "./time-import";

export const appRouter = router({
  account: accountRouter,
  clients: clientRouter,
  project: projectRouter,
  entry: entryRouter,
  invoice: invoiceRouter,
  report: reportRouter,
  timeImport: timeImportRouter,
  oauth: oauthRouter,
});

export type AppRouter = typeof appRouter;

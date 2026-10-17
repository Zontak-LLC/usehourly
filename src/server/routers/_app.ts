import { router } from "../trpc";
import { accountRouter } from "./account";
import { clientRouter } from "./client";
import { entryRouter } from "./entry";
import { insightsRouter } from "./insights";
import { invoiceRouter } from "./invoice";
import { invoiceLinkRouter } from "./invoice-link";
import { invoiceMailRouter } from "./invoice-mail";
import { oauthRouter } from "./oauth";
import { projectRouter } from "./project";
import { reportRouter } from "./report";
import { timeImportRouter } from "./time-import";
import { timesheetShareRouter } from "./timesheet-share";

export const appRouter = router({
  account: accountRouter,
  clients: clientRouter,
  project: projectRouter,
  entry: entryRouter,
  invoice: invoiceRouter,
  report: reportRouter,
  timeImport: timeImportRouter,
  oauth: oauthRouter,
  insights: insightsRouter,
  invoiceLink: invoiceLinkRouter,
  invoiceMail: invoiceMailRouter,
  timesheetShare: timesheetShareRouter,
});

export type AppRouter = typeof appRouter;

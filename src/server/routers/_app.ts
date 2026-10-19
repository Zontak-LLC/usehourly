import { router } from "../trpc";
import { accountRouter } from "./account";
import { accountingRouter } from "./accounting";
import { clientRouter } from "./client";
import { entryRouter } from "./entry";
import { insightsRouter } from "./insights";
import { invoiceRouter } from "./invoice";
import { invoiceLinkRouter } from "./invoice-link";
import { invoiceMailRouter } from "./invoice-mail";
import { memberRouter } from "./member";
import { oauthRouter } from "./oauth";
import { projectRouter } from "./project";
import { reportRouter } from "./report";
import { teamRouter } from "./team";
import { timeImportRouter } from "./time-import";
import { timesheetShareRouter } from "./timesheet-share";

export const appRouter = router({
  account: accountRouter,
  accounting: accountingRouter,
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
  team: teamRouter,
  member: memberRouter,
});

export type AppRouter = typeof appRouter;

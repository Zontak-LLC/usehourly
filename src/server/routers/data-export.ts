import { readExportRecords } from "../data-export";
import { protectedProcedure, router } from "../trpc";

export const dataExportRouter = router({
  /**
   * The caller's business details, clients, projects and team, for "Download everything" (time, invoices and expenses
   * come from their own `listAll` reads). Read only; no logos, tokens or sign-in data.
   */
  records: protectedProcedure.query(({ ctx }) =>
    readExportRecords({ prisma: ctx.prisma, userId: ctx.userId }, Math.floor(Date.now() / 1000)),
  ),
});

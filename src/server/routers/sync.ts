import { z } from "zod";

import { pullEntries } from "../entry-sync";
import { protectedProcedure, router } from "../trpc";

/** Local-first sync (issue #95, spike). Reads only; changes still travel through the `entry` procedures. */
export const syncRouter = router({
  /** What changed since `cursor` (null = send everything, a page at a time). See `pullEntries`. */
  pull: protectedProcedure
    .input(z.object({ cursor: z.number().int().min(0).nullable(), after: z.string().max(100).nullish() }))
    .query(({ ctx, input }) => pullEntries(ctx.prisma, ctx.userId, input)),
});

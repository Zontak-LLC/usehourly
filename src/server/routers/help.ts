import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { HELP_QUESTION_MAX, HELP_QUESTIONS_PER_DAY, SUPPORT_EMAIL } from "@/lib/help-question";
import { logError } from "@/lib/log";
import { helpQuestionMessage } from "@/lib/mailer";
import { describeWait, hitRateLimit } from "@/lib/rate-limit";

import { protectedProcedure, router } from "../trpc";

export const helpRouter = router({
  /**
   * Emails a question from the Help page to the support address (issue 375), so asking needs no GitHub account. The
   * sender's name and address are read from their account here, never taken from the browser; a reply goes to them.
   * Nothing is stored.
   */
  ask: protectedProcedure
    .input(
      z.object({
        text: z
          .string()
          .trim()
          .min(1, "Type your question first.")
          .max(HELP_QUESTION_MAX, `Keep it under ${HELP_QUESTION_MAX.toLocaleString("en-US")} characters.`),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.mailer)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email isn't set up on this server yet." });
      const user = await ctx.prisma.authUser.findUnique({
        where: { id: ctx.userId },
        select: { name: true, email: true, is_demo: true, email_verified_at: true },
      });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
      // A sample account's address is not real, so an answer could never reach it.
      if (user.is_demo) throw new TRPCError({ code: "FORBIDDEN", message: "Create a free account to ask a question." });

      const hit = await hitRateLimit(ctx.prisma, `helpask:u:${ctx.userId}`, HELP_QUESTIONS_PER_DAY, 86_400);
      if (!hit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `You've sent ${HELP_QUESTIONS_PER_DAY} questions today. Try again in ${describeWait(hit.retryAfterSeconds)}.`,
        });
      }

      try {
        await ctx.mailer.send(
          helpQuestionMessage(SUPPORT_EMAIL, {
            userId: ctx.userId,
            name: user.name,
            email: user.email,
            confirmed: Boolean(user.email_verified_at),
            question: input.text,
          }),
        );
      } catch (err) {
        logError("help_question_failed", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Couldn't send it right now. Please try again in a minute, or write to ${SUPPORT_EMAIL}.`,
        });
      }
      return { ok: true as const };
    }),
});

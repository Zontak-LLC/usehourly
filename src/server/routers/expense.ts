import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { DATE_RE, isRealDate, MAX_QUERY_DAYS, spanDays } from "@/lib/dates";
import { isDemoSession } from "@/lib/demo";
import {
  CATEGORY_IDS,
  DEFAULT_MILEAGE_RATE,
  MAX_DISTANCE,
  MAX_EXPENSE_CENTS,
  MAX_MILEAGE_RATE,
  MAX_NOTE,
  mileageCents,
} from "@/lib/expenses";
import { currencyOrDefault } from "@/lib/money";
import { assertWithinQuota } from "@/lib/quotas";

import { protectedProcedure, router } from "../trpc";

const dateSchema = z.string().regex(DATE_RE, "Use YYYY-MM-DD").refine(isRealDate, "That is not a real date.");
const noteSchema = z.string().trim().max(MAX_NOTE).nullish();

/** A plain expense: an amount in a category (never "mileage", which is a trip's own). */
const spend = z.object({
  kind: z.literal("expense"),
  date: dateSchema,
  category: z.enum(CATEGORY_IDS).refine((c) => c !== "mileage", "Pick a category."),
  amountCents: z.number().int().min(1).max(MAX_EXPENSE_CENTS),
  note: noteSchema,
  clientId: z.string().min(1).max(64).nullish(),
});

/** A trip: distance and rate; the amount is worked out here, never taken from the browser. */
const trip = z.object({
  kind: z.literal("mileage"),
  date: dateSchema,
  distance: z.number().int().min(1).max(MAX_DISTANCE),
  unit: z.enum(["mi", "km"]),
  rate: z.number().int().min(1).max(MAX_MILEAGE_RATE).default(DEFAULT_MILEAGE_RATE),
  note: noteSchema,
  clientId: z.string().min(1).max(64).nullish(),
});

const expenseInput = z.discriminatedUnion("kind", [spend, trip]);
type ExpenseInput = z.infer<typeof expenseInput>;

/** The columns an input stands for (both kinds write every column, so switching kind on edit leaves nothing behind). */
function columns(input: ExpenseInput) {
  const common = { date: input.date, note: input.note?.trim() || null, client_id: input.clientId ?? null };
  if (input.kind === "mileage") {
    return {
      ...common,
      kind: "mileage",
      category: "mileage",
      amount_cents: mileageCents(input.distance, input.rate),
      distance: input.distance,
      distance_unit: input.unit,
      mileage_rate: input.rate,
    };
  }
  return {
    ...common,
    kind: "expense",
    category: input.category,
    amount_cents: input.amountCents,
    distance: null,
    distance_unit: null,
    mileage_rate: null,
  };
}

type Ctx = { prisma: PrismaClient; userId: string };

/** A client given with an expense must be one of the caller's own. */
async function assertOwnClient(ctx: Ctx, clientId: string | null | undefined) {
  if (!clientId) return;
  const found = await ctx.prisma.client.findFirst({
    where: { id: clientId, user_id: ctx.userId },
    select: { id: true },
  });
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." });
}

const SELECT = {
  id: true,
  date: true,
  kind: true,
  category: true,
  amount_cents: true,
  currency: true,
  note: true,
  client_id: true,
  distance: true,
  distance_unit: true,
  mileage_rate: true,
  client: { select: { name: true } },
} as const;

export const expenseRouter = router({
  /** The caller's expenses in a date range (a year at most), newest first. */
  list: protectedProcedure
    .input(
      z
        .object({ from: dateSchema, to: dateSchema })
        .refine((r) => r.from <= r.to && spanDays(r.from, r.to) <= MAX_QUERY_DAYS, "Pick a range of a year or less."),
    )
    .query(({ ctx, input }) =>
      ctx.prisma.expense.findMany({
        where: { user_id: ctx.userId, date: { gte: input.from, lte: input.to } },
        select: SELECT,
        orderBy: [{ date: "desc" }, { created_at: "desc" }],
      }),
    ),

  create: protectedProcedure.input(expenseInput).mutation(async ({ ctx, input }) => {
    assertWithinQuota(
      await ctx.prisma.expense.count({ where: { user_id: ctx.userId } }),
      1,
      "expenses",
      isDemoSession(ctx.session),
    );
    await assertOwnClient(ctx, input.clientId);
    const user = await ctx.prisma.authUser.findUnique({ where: { id: ctx.userId }, select: { currency: true } });
    return ctx.prisma.expense.create({
      data: { user_id: ctx.userId, currency: currencyOrDefault(user?.currency), ...columns(input) },
      select: SELECT,
    });
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(64), expense: expenseInput }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnClient(ctx, input.expense.clientId);
      const { count } = await ctx.prisma.expense.updateMany({
        where: { id: input.id, user_id: ctx.userId },
        data: columns(input.expense),
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found." });
      return { id: input.id };
    }),

  delete: protectedProcedure.input(z.object({ id: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.prisma.expense.deleteMany({ where: { id: input.id, user_id: ctx.userId } });
    if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found." });
    return { id: input.id };
  }),
});

import type { PrismaClient } from "@prisma/client";

import {
  buildDemoData,
  DEMO_EMAIL_DOMAIN,
  DEMO_PASSWORD_HASH,
  DEMO_PER_IP,
  DEMO_TTL_HOURS,
  MAX_LIVE_DEMOS,
} from "@/lib/demo";
import { hitRateLimit } from "@/lib/rate-limit";

import { appRouter } from "./routers/_app";
import { createCallerFactory } from "./trpc";

export type DemoResult =
  | { ok: true; user: { id: string; name: string; email: string; token_version: number } }
  | { ok: false; reason: "rate" | "busy" };

// An entry row binds about nine values and D1 allows about 100 per statement.
const INSERT_GROUP = 8;

/**
 * Makes a demo account with sample clients, projects, entries and two invoices (the invoices go
 * through the real invoice code, so they are exactly what a member would get). Old demos are swept
 * first, so no scheduled job is needed. Refuses when one connection asks too often or too many
 * demos are alive at once.
 */
export async function createDemoUser(
  prisma: PrismaClient,
  opts: { ip?: string | null; now?: Date } = {},
): Promise<DemoResult> {
  const now = opts.now ?? new Date();
  if (opts.ip) {
    const hit = await hitRateLimit(
      prisma,
      `demo:ip:${opts.ip}`,
      DEMO_PER_IP.limit,
      DEMO_PER_IP.windowSeconds,
      Math.floor(now.getTime() / 1000),
    );
    if (!hit.allowed) return { ok: false, reason: "rate" };
  }

  // Sweep demos older than a day (rows go with their owner: clients, projects, entries, invoices).
  await prisma.authUser.deleteMany({
    where: { is_demo: true, created_at: { lt: new Date(now.getTime() - DEMO_TTL_HOURS * 3_600_000) } },
  });
  if ((await prisma.authUser.count({ where: { is_demo: true } })) >= MAX_LIVE_DEMOS) {
    return { ok: false, reason: "busy" };
  }

  const id = crypto.randomUUID();
  const user = await prisma.authUser.create({
    data: {
      id,
      name: "Demo",
      email: `demo-${id.slice(0, 8)}@${DEMO_EMAIL_DOMAIN}`,
      password_hash: DEMO_PASSWORD_HASH,
      is_demo: true,
      business_name: "Sample Freelance Studio",
      address: "12 Example Street\nSpringfield, IL 62701",
      payment_instructions: "Pay by bank transfer within 30 days.\n(Sample text: replace it with your own.)",
    },
    select: { id: true, name: true, email: true, token_version: true },
  });

  try {
    await seedDemo(prisma, user.id, now);
  } catch (err) {
    // Never leave a half-made demo behind.
    await prisma.authUser.deleteMany({ where: { id: user.id } });
    throw err;
  }
  return {
    ok: true,
    user: { id: user.id, name: user.name ?? "Demo", email: user.email, token_version: user.token_version },
  };
}

async function seedDemo(prisma: PrismaClient, userId: string, now: Date) {
  const data = buildDemoData(now.toISOString().slice(0, 10));

  const clientIds = new Map<string, string>();
  for (const c of data.clients) {
    const made = await prisma.client.create({
      data: {
        user_id: userId,
        name: c.name,
        color: c.color,
        legal_name: c.legalName || null,
        address: c.address || null,
      },
      select: { id: true },
    });
    clientIds.set(c.key, made.id);
  }
  const projectIds = new Map<string, string>();
  for (const p of data.projects) {
    const made = await prisma.project.create({
      data: {
        user_id: userId,
        client_id: clientIds.get(p.clientKey) as string,
        name: p.name,
        hourly_rate: p.hourlyRate,
        billable: p.billable,
      },
      select: { id: true },
    });
    projectIds.set(p.key, made.id);
  }
  const rows = data.entries.map((e) => ({
    user_id: userId,
    project_id: projectIds.get(e.projectKey) as string,
    date: e.date,
    minutes: e.minutes,
    note: e.note,
  }));
  for (let i = 0; i < rows.length; i += INSERT_GROUP) {
    await prisma.timeEntry.createMany({ data: rows.slice(i, i + INSERT_GROUP) });
  }

  const caller = createCallerFactory(appRouter)({
    session: { user: { id: userId, demo: true }, expires: "" },
    prisma,
  });
  for (const [i, inv] of data.invoices.entries()) {
    const made = await caller.invoice.create({
      clientId: clientIds.get(inv.clientKey) as string,
      from: inv.from,
      to: inv.to,
      number: `INV-${inv.issueDate.slice(0, 4)}-${String(i + 1).padStart(3, "0")}`,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      notes: "Thank you for your business!",
      includeDetail: true,
      compactNotes: false,
    });
    if (inv.paidDate) await caller.invoice.markPaid({ id: made.id, paidDate: inv.paidDate });
  }
}

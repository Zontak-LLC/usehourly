import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import type { BusinessRecord, ClientRecord, ExportRecords, ProjectRecord, TeamRecord } from "@/lib/export-records";
import { effectiveCurrency } from "@/lib/money";
import { memberStatus } from "@/lib/team";

/*
 * What "Download everything" needs besides time, invoices and expenses: the account's business details, clients,
 * projects and team. Every read is the caller's own and selects only the fields the zip writes: never logos, avatars,
 * sign-in data or invitation tokens.
 */

const businessSelect = {
  name: true,
  email: true,
  business_name: true,
  ein: true,
  address: true,
  payment_instructions: true,
  tax_name: true,
  tax_rate: true,
  tax_number: true,
  currency: true,
  hourly_rate: true,
} as const;

const clientSelect = {
  name: true,
  legal_name: true,
  address: true,
  email: true,
  currency: true,
  color: true,
  round_step: true,
  round_mode: true,
  round_min: true,
  invoice_every: true,
  invoice_anchor: true,
  archived: true,
} as const;

const projectSelect = {
  name: true,
  hourly_rate: true,
  billable: true,
  budget_amount: true,
  budget_unit: true,
  budget_period: true,
  archived: true,
  client: { select: { name: true } },
} as const;

const teamSelect = { label: true, email: true, member_id: true, revoked_at: true, expires_at: true } as const;

type Reader = { prisma: PrismaClient; userId: string };

async function readBusiness({ prisma, userId }: Reader): Promise<BusinessRecord> {
  const user = await prisma.authUser.findUnique({ where: { id: userId }, select: businessSelect });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
  return {
    name: user.name,
    email: user.email,
    businessName: user.business_name,
    ein: user.ein,
    address: user.address,
    paymentInstructions: user.payment_instructions,
    taxName: user.tax_name,
    taxRatePercent: user.tax_rate ? user.tax_rate / 100 : null,
    taxNumber: user.tax_number,
    currency: user.currency,
    defaultHourlyRate: user.hourly_rate / 100,
  };
}

async function readClients({ prisma, userId }: Reader, accountCurrency: string): Promise<ClientRecord[]> {
  const rows = await prisma.client.findMany({ where: { user_id: userId }, select: clientSelect });
  return rows.map((c) => ({
    name: c.name,
    legalName: c.legal_name,
    address: c.address,
    email: c.email,
    currency: effectiveCurrency(c.currency, accountCurrency),
    color: c.color,
    roundStep: c.round_step,
    roundMode: c.round_mode,
    roundMin: c.round_min,
    invoiceEvery: c.invoice_every,
    invoiceAnchor: c.invoice_anchor,
    archived: c.archived,
  }));
}

async function readProjects({ prisma, userId }: Reader): Promise<ProjectRecord[]> {
  const rows = await prisma.project.findMany({ where: { user_id: userId }, select: projectSelect });
  return rows.map((p) => ({
    clientName: p.client.name,
    name: p.name,
    hourlyRate: p.hourly_rate,
    billable: p.billable,
    budgetAmount: p.budget_amount,
    budgetUnit: p.budget_unit,
    budgetPeriod: p.budget_period,
    archived: p.archived,
  }));
}

async function readTeam({ prisma, userId }: Reader, nowSeconds: number): Promise<TeamRecord[]> {
  const rows = await prisma.teamMember.findMany({
    where: { owner_id: userId },
    select: teamSelect,
    orderBy: { created_at: "asc" },
  });
  return rows.map((m) => ({ name: m.label, email: m.email, status: memberStatus(m, nowSeconds) }));
}

/**
 * The caller's business details, clients and projects (archived ones too, each project with its client's name) and
 * team, in one go. `nowSeconds` decides whether an invitation is still pending. Throws NOT_FOUND when the account is
 * gone.
 */
export async function readExportRecords(reader: Reader, nowSeconds: number): Promise<ExportRecords> {
  const [business, projects, team] = await Promise.all([
    readBusiness(reader),
    readProjects(reader),
    readTeam(reader, nowSeconds),
  ]);
  const clients = await readClients(reader, business.currency);
  return { business, clients, projects, team };
}

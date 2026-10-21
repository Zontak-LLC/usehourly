import type { PrismaClient } from "@prisma/client";

import { logError } from "@/lib/log";
import { parseSupportNotice, SUPPORT_NOTICE_KEY, type SupportNotice } from "@/lib/support-notice";

/**
 * The notice to show, or null when it is off. One primary-key read. It sits in the layout of every signed-in page, so a
 * failure here (say the table is not there yet during a deploy) must show no notice, never an error page.
 */
export async function readSupportNotice(prisma: Pick<PrismaClient, "appSetting">): Promise<SupportNotice | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SUPPORT_NOTICE_KEY }, select: { value: true } });
    return parseSupportNotice(row?.value);
  } catch (err) {
    logError("support_notice_read_failed", err);
    return null;
  }
}

/** What the owner sees in the switch: the saved values even while it is off. */
export async function readSupportNoticeSetting(
  prisma: Pick<PrismaClient, "appSetting">,
): Promise<{ on: boolean; cost: number | null }> {
  const row = await prisma.appSetting.findUnique({ where: { key: SUPPORT_NOTICE_KEY }, select: { value: true } });
  try {
    const v = JSON.parse(row?.value ?? "null") as { on?: unknown; cost?: unknown } | null;
    const cost = typeof v?.cost === "number" && Number.isInteger(v.cost) ? v.cost : null;
    return { on: v?.on === true && parseSupportNotice(row?.value) !== null, cost };
  } catch {
    return { on: false, cost: null };
  }
}

export async function writeSupportNotice(prisma: Pick<PrismaClient, "appSetting">, notice: SupportNotice) {
  const value = JSON.stringify(notice);
  await prisma.appSetting.upsert({
    where: { key: SUPPORT_NOTICE_KEY },
    create: { key: SUPPORT_NOTICE_KEY, value },
    update: { value },
  });
}

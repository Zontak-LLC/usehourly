import type { PrismaClient } from "@prisma/client";

import { isAdminUser } from "@/lib/admin";

/** True when this signed-in account is on the admin allow-list (and has a confirmed address). */
export async function isAdminAccount(prisma: Pick<PrismaClient, "authUser">, userId: string): Promise<boolean> {
  const user = await prisma.authUser.findUnique({
    where: { id: userId },
    select: { email: true, email_verified_at: true, is_demo: true },
  });
  return isAdminUser(user);
}

import type { PrismaClient } from "@prisma/client";

/**
 * Makes `clientIds` the exact clients a team member may log time on. It adds the missing grants first and removes the
 * old ones after, as two separate writes (the D1 adapter has no real transactions): if the add fails the member keeps
 * the old grants, and if the remove fails they keep old and new, so a failed save never leaves them with none. Saving
 * again finishes the job. Writes nothing when the list is unchanged. Throws whatever the database throws.
 */
export async function replaceGrants(
  prisma: Pick<PrismaClient, "teamMemberClient">,
  memberId: string,
  clientIds: readonly string[],
): Promise<void> {
  const current = await prisma.teamMemberClient.findMany({
    where: { team_member_id: memberId },
    select: { client_id: true },
  });
  const granted = new Set(current.map((g) => g.client_id));
  const missing = clientIds.filter((id) => !granted.has(id));
  if (missing.length > 0) {
    await prisma.teamMemberClient.createMany({
      data: missing.map((client_id) => ({ team_member_id: memberId, client_id })),
    });
  }
  const isDropping = current.some((g) => !clientIds.includes(g.client_id));
  if (isDropping) {
    await prisma.teamMemberClient.deleteMany({
      where: { team_member_id: memberId, client_id: { notIn: [...clientIds] } },
    });
  }
}

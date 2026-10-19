import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

/**
 * The accepted, not-removed membership `memberId` holds, with the client ids it grants. Every member-side procedure
 * starts here: a member may only act for an owner who has not removed them, on clients that owner granted.
 */
export async function activeMembership(prisma: Pick<PrismaClient, "teamMember">, memberId: string, teamId: string) {
  const row = await prisma.teamMember.findFirst({
    where: { id: teamId, member_id: memberId, revoked_at: null },
    include: { clients: { select: { client_id: true } } },
  });
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That team isn't available any more." });
  return { id: row.id, ownerId: row.owner_id, clientIds: row.clients.map((c) => c.client_id) };
}

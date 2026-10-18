import { auth } from "@/lib/auth";
import { clientIpFrom } from "@/lib/client-ip";
import { appUrl, createMailer } from "@/lib/mailer";
import { getPrisma } from "@/lib/prisma";
import { enforceRequestLimits } from "@/lib/request-limits";
import { sessionStillValid } from "@/lib/session-version";
import { callsInTrpcRequest } from "@/lib/trpc-limits";

export async function createContext(req?: Request) {
  const [rawSession, prisma] = await Promise.all([auth(), getPrisma()]);
  // A token from before a password change (or for a deleted account) is no longer a session.
  let session = rawSession;
  if (rawSession?.user?.id) {
    const row = await prisma.authUser.findUnique({
      where: { id: rawSession.user.id },
      select: { token_version: true },
    });
    if (!sessionStillValid(rawSession.user.tv, row?.token_version)) session = null;
  }
  // The edge sets the real client address; clientIpFrom reads it safely.
  const ip = clientIpFrom(req?.headers);
  // Throttle changes per account (or per connection before sign-in); see lib/request-limits.ts.
  if (req) {
    await enforceRequestLimits(prisma, {
      method: req.method,
      userId: session?.user?.id,
      ip,
      calls: callsInTrpcRequest(req.url),
    });
  }
  return { session, prisma, ip, mailer: createMailer(), baseUrl: appUrl() };
}

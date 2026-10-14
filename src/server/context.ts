import { auth } from "@/lib/auth";
import { appUrl, createMailer } from "@/lib/mailer";
import { getPrisma } from "@/lib/prisma";
import { sessionStillValid } from "@/lib/session-version";

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
  // Cloudflare sets cf-connecting-ip; it is the real client address behind the edge.
  const ip = req?.headers.get("cf-connecting-ip") ?? null;
  return { session, prisma, ip, mailer: createMailer(), baseUrl: appUrl() };
}

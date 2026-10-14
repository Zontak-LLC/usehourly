import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function createContext(req?: Request) {
  const [session, prisma] = await Promise.all([auth(), getPrisma()]);
  // Cloudflare sets cf-connecting-ip; it is the real client address behind the edge.
  const ip = req?.headers.get("cf-connecting-ip") ?? null;
  return { session, prisma, ip };
}

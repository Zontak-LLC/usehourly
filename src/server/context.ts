import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export async function createContext() {
  const [session, prisma] = await Promise.all([auth(), getPrisma()]);
  return { session, prisma };
}

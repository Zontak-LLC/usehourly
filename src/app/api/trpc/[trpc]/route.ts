import { createContext } from "@/server/context";
import { handleTrpc } from "@/server/trpc-handler";

const handler = (req: Request) => handleTrpc(req, () => createContext(req));

export { handler as GET, handler as POST };

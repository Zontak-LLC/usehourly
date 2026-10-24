# trpc-mcp-server (working name)

Serve the procedures your app already has to AI assistants (Claude, ChatGPT, Cursor and other MCP
clients) as a safe MCP server: Streamable HTTP, stateless, JSON replies, no SDK in your bundle.

This is the first slice of [issue 125](https://github.com/Zontak-LLC/usehourly/issues/125). The code
was extracted from UseHourly's MCP server, and UseHourly runs on it (`src/server/mcp/protocol.ts`
and `http.ts` are now thin adapters). It is not published yet: the name, repo and docs home are the
owner's choice.

## What you write in your app

```ts
import { createMcpHttpHandler, createMcpServer, defineTool } from "trpc-mcp-server";
import { z } from "zod";

type Ctx = { userId: string; access: "read" | "write"; tokenId: string };
const as = (ctx: Ctx) => createCaller({ userId: ctx.userId }); // your tRPC createCallerFactory

const server = createMcpServer<Ctx>({
  info: { name: "notes", version: "1.0.0" },
  instructions: "Notes for one person. Ask before deleting.",
  tools: [
    defineTool({
      name: "add_note",
      title: "Add a note",
      description: "Saves a note.",
      access: "write", // refused for read-only tokens before anything runs
      input: z.object({ text: z.string().min(1).describe("What to write") }),
      output: z.object({ id: z.number(), text: z.string() }), // required
      run: (args: { text: string }, ctx: Ctx) => as(ctx).notes.add(args), // runs as the token's owner
    }),
  ],
  describeError: (e) => (e instanceof TRPCError && e.code !== "INTERNAL_SERVER_ERROR" ? e.message : "Something went wrong."),
});

export const POST = createMcpHttpHandler<Ctx>({
  server,
  appUrl: "https://notes.example",
  authenticate: async (req) => /* check the bearer token */ ({ ok: true, ctx }),
  rateLimit: async (ctx, cost) => /* count `cost` calls for ctx.tokenId */ ({ allowed: true }),
});
```

## What it does for you

- JSON-RPC 2.0: initialize (version negotiation), ping, tools, resources, resource templates, prompts,
  notifications (202), batches (capped, default 20).
- Every tool advertises an input and an output JSON Schema and honest hints (read only, destructive,
  idempotent). A server with a tool that has no output schema refuses to start;
  `catalogProblems(tools)` lists undocumented parameters, duplicates and non-object results, for a test.
- Write tools are refused unless the context says `access: "write"` (fails closed).
- Arguments are validated before your code runs; results over 120,000 characters are refused.
- Errors become text for the model through your `describeError`; unexpected ones go to `onInternalError`.
- HTTP: POST only (405 otherwise), a browser Origin from another site is refused (403), your
  `authenticate` runs before the body is read, bodies over 256 KB are refused (413), a batch costs one
  call per message in your `rateLimit` (429 with Retry-After).
- `server.catalog()` gives everything a stdio bridge or a directory needs without a token.

## Not in this slice (still in UseHourly)

- Personal access tokens (hashed storage, scopes, expiry, revoked on password change):
  `src/lib/api-token.ts`, `src/server/mcp/auth.ts`. Needs a storage adapter interface (D1, Prisma, Postgres).
- OAuth 2.1 with PKCE and dynamic client registration: `src/lib/oauth.ts`, `src/server/oauth.ts`.
- The stdio bridge with its generated catalog and the publish workflow (`bridge/`).
- Open question: generate tools from procedures (with read/write marks) or keep them hand written.
- A second real user (Duely or Tenderly), its own repo, npm name and docs.

Test: `test/serve-a-trpc-app.test.ts` serves a small tRPC notes app (not UseHourly) through the
package: isolation through the caller, the read-only guard, argument checks, hidden internal errors,
the HTTP door and batch costs.

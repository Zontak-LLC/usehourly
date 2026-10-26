import { describe, expect, it, vi } from "vitest";

import { HELP_QUESTION_MAX, HELP_QUESTIONS_PER_DAY, SUPPORT_EMAIL } from "@/lib/help-question";
import { createMailer, type MailMessage } from "@/lib/mailer";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { memoryRateLimit } from "./helpers/memory-rate-limit";

const createCaller = createCallerFactory(appRouter);

/**
 * "Ask a question" on Help (issue 375): a signed-in person's question is emailed to support with Reply-To set to their
 * own address, so it needs no GitHub account. Name and address come from the account row, never from the browser.
 */

type User = { name: string | null; email: string; is_demo: boolean; email_verified_at: Date | null };
const goodUser: User = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  is_demo: false,
  email_verified_at: new Date(),
};

function world(over: { user?: Partial<User>; mail?: "none" | "ok" | "fails" } = {}) {
  const user = { ...goodUser, ...over.user };
  const limiter = memoryRateLimit();
  const prisma = {
    rateLimit: limiter.rateLimit,
    authUser: { findUnique: vi.fn(async () => user) },
  };
  const send = vi.fn(async (_m: MailMessage) => {
    if (over.mail === "fails") throw new Error("resend said: key re_secret_123 is invalid");
  });
  const mailer = over.mail === "none" ? null : { send };
  const ctx = { session: { user: { id: "u1" }, expires: "" }, prisma: prisma as never, mailer };
  return {
    prisma,
    send,
    caller: createCaller(ctx as never),
    signedOut: createCaller({ ...ctx, session: null } as never),
  };
}

const QUESTION = "I logged 2h on Monday and Week shows 0:00";

describe("asking a question from the Help page", () => {
  it("emails the question to support, with replies going to the account's own address", async () => {
    const w = world();
    expect(await w.caller.help.ask({ text: QUESTION })).toEqual({ ok: true });
    expect(w.send).toHaveBeenCalledTimes(1);
    const m = w.send.mock.calls[0][0];
    expect(m.to).toBe(SUPPORT_EMAIL);
    expect(m.to).toBe("admin@zontakllc.com");
    expect(m.replyTo).toBe("ada@example.com");
    expect(m.subject).toBe("UseHourly question from Ada Lovelace");
    expect(m.fromName).toBe("Ada Lovelace via UseHourly");
    expect(m.text).toContain(QUESTION);
    expect(m.text).toContain("ada@example.com");
    expect(m.text).toContain("u1"); // the account id, so support can find it
    expect(m.text).not.toContain("(not confirmed)");
    expect(m.text).toContain("Reply to this email to answer them.");
    expect(m.html).toContain("I logged 2h on Monday");
    expect(w.prisma.authUser.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1" } }));
  });

  it("takes the name and address from the account, whatever else the browser sends", async () => {
    const w = world();
    await w.caller.help.ask({
      text: QUESTION,
      email: "boss@bank.example",
      name: "The Bank",
      replyTo: "boss@bank.example",
      to: "victim@example.org",
    } as never);
    const m = w.send.mock.calls[0][0];
    expect(m.to).toBe("admin@zontakllc.com");
    expect(m.replyTo).toBe("ada@example.com");
    expect(m.subject).not.toContain("Bank");
    expect(m.text).not.toContain("boss@bank.example");
  });

  it("uses the address when there is no name, and says when the address is not confirmed", async () => {
    const w = world({ user: { name: null, email_verified_at: null } });
    await w.caller.help.ask({ text: QUESTION });
    const m = w.send.mock.calls[0][0];
    expect(m.subject).toBe("UseHourly question from ada@example.com");
    expect(m.text).toContain("ada@example.com (not confirmed)");
  });

  it("refuses an empty, blank or too long question without calling the mailer, and sends exactly the cap", async () => {
    for (const text of ["", "   \n\t ", "x".repeat(HELP_QUESTION_MAX + 1)]) {
      const w = world();
      await expect(w.caller.help.ask({ text })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(w.send).not.toHaveBeenCalled();
    }
    const w = world();
    await w.caller.help.ask({ text: "y".repeat(HELP_QUESTION_MAX) });
    expect(w.send).toHaveBeenCalledTimes(1);
    expect(HELP_QUESTION_MAX).toBe(2000);
  });

  it("needs a session, and refuses a sample account (its address is not real)", async () => {
    const out = world();
    await expect(out.signedOut.help.ask({ text: QUESTION })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(out.send).not.toHaveBeenCalled();

    const demo = world({ user: { is_demo: true, email: "x@demo.invalid" } });
    await expect(demo.caller.help.ask({ text: QUESTION })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Create a free account to ask a question.",
    });
    expect(demo.send).not.toHaveBeenCalled();
  });

  it("allows 5 questions a day per account; the 6th is refused and not sent", async () => {
    const w = world();
    for (let i = 0; i < HELP_QUESTIONS_PER_DAY; i++) await w.caller.help.ask({ text: `${QUESTION} (${i})` });
    expect(w.send).toHaveBeenCalledTimes(5);
    await expect(w.caller.help.ask({ text: QUESTION })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: expect.stringMatching(/^You've sent 5 questions today\. Try again in about \d+ minutes\.$/),
    });
    expect(w.send).toHaveBeenCalledTimes(5);
  });

  it("says plainly when email is not set up", async () => {
    const w = world({ mail: "none" });
    await expect(w.caller.help.ask({ text: QUESTION })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Email isn't set up on this server yet.",
    });
  });

  it("logs a failed send and says so, never showing the provider's error", async () => {
    const w = world({ mail: "fails" });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const err = await w.caller.help.ask({ text: QUESTION }).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
      expect(String((err as Error).message)).not.toContain("re_secret");
      expect(logged.mock.calls.some(([line]) => String(line).includes('"event":"help_question_failed"'))).toBe(true);
    } finally {
      logged.mockRestore();
    }
  });

  it("a name with line breaks or quotes cannot add headers or change the From address", async () => {
    const w = world({ user: { name: 'Eve"\r\nBcc: all@example.org\n<evil@example.org>' } });
    await w.caller.help.ask({ text: QUESTION });
    const m = w.send.mock.calls[0][0];
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.subject.startsWith("UseHourly question from Eve")).toBe(true);

    // What reaches the email service: the configured address stays the sender, and the name cannot break out of it.
    const posted: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        posted.push(JSON.parse(init.body));
        return new Response("{}", { status: 200 });
      }),
    );
    try {
      const real = createMailer({ RESEND_API_KEY: "test-key", EMAIL_FROM: "UseHourly <hi@usehourly.test>" });
      await real?.send(m);
    } finally {
      vi.unstubAllGlobals();
    }
    const from = String(posted[0].from);
    expect(from).toMatch(/<hi@usehourly\.test>$/);
    expect(from).not.toMatch(/[\r\n]/);
    expect(from.match(/</g)).toHaveLength(1);
    expect(from).not.toContain("evil@example.org>");
    expect(posted[0].reply_to).toBe("ada@example.com");
    expect(String(posted[0].subject)).not.toMatch(/[\r\n]/);
  });
});

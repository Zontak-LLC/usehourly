import { describe, expect, it, vi } from "vitest";

import { AI_KEY_STORAGE, type AiSetup, clearAiKey, readAiSetup, saveAiSetup } from "@/lib/ai-key";
import {
  AiError,
  buildPolishRequest,
  POLISH_MAX_INPUT,
  parsePolishResponse,
  polishNote,
  testKey,
} from "@/lib/ai-polish";
import { defaultModel, detectProvider, isModelId, PROVIDER_IDS, PROVIDERS } from "@/lib/ai-provider";

/**
 * Issue #98: "Polish" a description with the person's own key, for Anthropic (Claude) or OpenAI (ChatGPT). The browser
 * calls the service directly, so what matters is exactly what is sent (only the note and two names), that failures
 * read as plain sentences that never carry the service's own text, and that the key stays in this browser, for one account.
 */

const CLAUDE: AiSetup = {
  provider: "anthropic",
  key: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789",
  model: "claude-haiku-5-5",
};
const GPT: AiSetup = {
  provider: "openai",
  key: "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789_-ABC",
  model: "gpt-4.1-nano",
};
const SETUPS = [CLAUDE, GPT];
const input = { note: "fixed the nav bug on mobile", project: "Website", client: "Acme" };

/** A service's answer in its own shape. */
const answer = (setup: AiSetup, text: string) =>
  new Response(
    JSON.stringify(
      setup.provider === "anthropic"
        ? { content: [{ type: "text", text }] }
        : { choices: [{ message: { role: "assistant", content: text } }] },
    ),
    { status: 200 },
  );
const fetchReturning = (res: Response) => vi.fn(async () => res) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("what is sent", () => {
  it("goes to the chosen service only, with the person's own key", () => {
    const a = buildPolishRequest(CLAUDE, input);
    expect(a.url).toBe("https://api.anthropic.com/v1/messages");
    const ah = a.init.headers as Record<string, string>;
    expect(ah["x-api-key"]).toBe(CLAUDE.key);
    expect(ah["anthropic-version"]).toBe("2023-06-01");
    expect(ah["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(ah.authorization).toBeUndefined();

    const o = buildPolishRequest(GPT, input);
    expect(o.url).toBe("https://api.openai.com/v1/chat/completions");
    const oh = o.init.headers as Record<string, string>;
    expect(oh.authorization).toBe(`Bearer ${GPT.key}`);
    expect(oh["x-api-key"]).toBeUndefined();
    expect(a.init.method).toBe("POST");
    expect(o.init.method).toBe("POST");
  });

  it("uses the chosen model, with the shape each service expects, and nothing else in the body", () => {
    const a = JSON.parse(String(buildPolishRequest({ ...CLAUDE, model: "claude-sonnet-5-5" }, input).init.body));
    expect(Object.keys(a).sort()).toEqual(["max_tokens", "messages", "model", "system"]);
    expect(a.model).toBe("claude-sonnet-5-5");
    expect(a.messages).toHaveLength(1);

    const o = JSON.parse(String(buildPolishRequest({ ...GPT, model: "gpt-4o-mini" }, input).init.body));
    expect(Object.keys(o).sort()).toEqual(["max_completion_tokens", "messages", "model"]);
    expect(o.model).toBe("gpt-4o-mini");
    expect(o.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
  });

  it("holds the note and the project and client names, and nothing else, for both services", () => {
    for (const setup of SETUPS) {
      const text = String(buildPolishRequest(setup, input).init.body);
      const body = JSON.parse(text);
      const user = (body.messages as { role: string; content: string }[]).find((m) => m.role === "user");
      expect(user?.content).toBe("Client: Acme\nProject: Website\nNote: fixed the nav bug on mobile");
      expect(text).not.toContain(setup.key); // the key is a header, never in the text
      expect(text).toMatch(/add nothing/i); // told not to invent facts
    }
  });

  it("cuts a very long note, and keeps names on one short line", () => {
    for (const setup of SETUPS) {
      const req = buildPolishRequest(setup, {
        note: "x".repeat(POLISH_MAX_INPUT + 500),
        project: "Line one\nline two ".repeat(20),
        client: "Acme",
      });
      const body = JSON.parse(String(req.init.body));
      const content = (body.messages as { role: string; content: string }[]).find((m) => m.role === "user")
        ?.content as string;
      expect(content.split("\n")).toHaveLength(3); // client, project, note: a name cannot add lines
      expect(content.length).toBeLessThan(POLISH_MAX_INPUT + 250);
    }
  });
});

describe("polishing a note", () => {
  it("returns the cleaned suggestion for both services: no wrapping quotes, one line", async () => {
    for (const setup of SETUPS) {
      const f = fetchReturning(answer(setup, '  "Fixed a navigation bug on mobile.\n"  '));
      expect(await polishNote(f, setup, input)).toBe("Fixed a navigation bug on mobile.");
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it("does not call anything for an empty note", async () => {
    const f = fetchReturning(answer(CLAUDE, "x"));
    await expect(polishNote(f, CLAUDE, { ...input, note: "   " })).rejects.toMatchObject({ kind: "empty" });
    expect(f).not.toHaveBeenCalled();
  });

  it("explains each failure in plain words, names the right service, and never repeats its own text", async () => {
    const secret = "internal detail req_9f8e7d: key sk-ant-leak";
    const cases: [number, string, string, string][] = [
      [401, secret, "key", "refused that key"],
      [403, secret, "key", "refused that key"],
      [404, secret, "model", "that model"],
      [402, secret, "credit", "no credit left"],
      [400, `Your credit balance is too low ${secret}`, "credit", "no credit left"], // Anthropic's empty balance
      [429, `{"error":{"code":"insufficient_quota"}} ${secret}`, "credit", "no credit left"], // OpenAI's empty balance
      [429, secret, "rate", "too fast"],
      [500, secret, "other", "couldn't polish"],
    ];
    for (const setup of SETUPS) {
      const name = setup.provider === "anthropic" ? "Anthropic" : "OpenAI";
      for (const [status, text, kind, words] of cases) {
        const err = (await polishNote(fetchReturning(new Response(text, { status })), setup, input).catch(
          (e) => e,
        )) as AiError;
        expect(err).toBeInstanceOf(AiError);
        expect(err.kind).toBe(kind);
        expect(err.message.toLowerCase()).toContain(words);
        expect(err.message).toContain(name);
        expect(err.message).not.toContain("req_9f8e7d");
        expect(err.message).not.toContain("sk-ant");
      }
    }
  });

  it("says so when it cannot reach the service, but lets a cancelled call stay a cancel", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(polishNote(offline, GPT, input)).rejects.toMatchObject({ kind: "network" });
    const aborted = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;
    await expect(polishNote(aborted, GPT, input)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("copes with an answer that is empty, in the wrong shape, or not JSON", async () => {
    for (const setup of SETUPS) {
      await expect(polishNote(fetchReturning(answer(setup, "   ")), setup, input)).rejects.toMatchObject({
        kind: "empty",
      });
      await expect(
        polishNote(fetchReturning(new Response("<html>", { status: 200 })), setup, input),
      ).rejects.toMatchObject({ kind: "other" });
      expect(() => parsePolishResponse(setup.provider, null)).toThrow(AiError);
      expect(() => parsePolishResponse(setup.provider, {})).toThrow(AiError);
    }
    // each service's answer is read in its own shape only
    expect(() => parsePolishResponse("openai", { content: [{ type: "text", text: "hi" }] })).toThrow(AiError);
    expect(() => parsePolishResponse("anthropic", { choices: [{ message: { content: "hi" } }] })).toThrow(AiError);
    expect(() => parsePolishResponse("openai", { choices: [{ message: { content: null } }] })).toThrow(AiError);
  });

  it("tests a key and model with one tiny call", async () => {
    for (const setup of SETUPS) {
      const f = fetchReturning(answer(setup, "Fixed a bug."));
      await expect(testKey(f, setup)).resolves.toBeUndefined();
      expect(f).toHaveBeenCalledTimes(1);
      await expect(testKey(fetchReturning(new Response("no", { status: 401 })), setup)).rejects.toMatchObject({
        kind: "key",
      });
    }
  });
});

describe("services and models", () => {
  it("tells whose key it is, and never mistakes one for the other", () => {
    expect(detectProvider(CLAUDE.key)).toBe("anthropic");
    expect(detectProvider(` ${GPT.key} `)).toBe("openai");
    expect(detectProvider("sk-abcdefghijklmnopqrstuvwxyz0123")).toBe("openai"); // an older OpenAI key
    for (const bad of [
      "",
      "sk-ant-short",
      "sk-short",
      "hunter2",
      "pk-abcdefghijklmnopqrstuvwxyz0123",
      "sk- spaced key here 1234567890",
    ]) {
      expect(detectProvider(bad)).toBeNull();
    }
  });

  it("starts every service on its cheapest model, and lists a few to choose from", () => {
    expect(defaultModel("anthropic")).toBe("claude-haiku-5-5");
    expect(defaultModel("openai")).toBe("gpt-4.1-nano");
    for (const id of PROVIDER_IDS) {
      const models = PROVIDERS[id].models;
      expect(models.length).toBeGreaterThanOrEqual(2);
      for (const m of models) expect(isModelId(m.id)).toBe(true);
    }
  });

  it("only accepts a model name that is a plain name", () => {
    for (const ok of ["gpt-4o-mini", "claude-sonnet-5-5", "o4-mini", "ft:gpt-4.1-nano:acme::abc123", "models/x.1"]) {
      expect(isModelId(ok)).toBe(true);
    }
    for (const bad of ["", " ", "has space", "new\nline", '"quoted"', "a".repeat(81), "-leading", "x;y", "<script>"]) {
      expect(isModelId(bad)).toBe(false);
    }
  });
});

describe("the key stays in this browser, for one account", () => {
  const fakeStorage = () => {
    const m = new Map<string, string>();
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };

  it("is read back only by the account that saved it, with its service and model", () => {
    for (const setup of SETUPS) {
      const s = fakeStorage();
      expect(saveAiSetup(s, "u1", setup)).toBe(true);
      expect(readAiSetup(s, "u1")).toEqual(setup);
      expect(readAiSetup(s, "u2")).toBeNull(); // another account on the same device never gets it
      expect(readAiSetup(s, null)).toBeNull();
      expect(readAiSetup(null, "u1")).toBeNull();
    }
  });

  it("refuses a key that belongs to the other service, and a model name that is not a plain name", () => {
    const s = fakeStorage();
    expect(saveAiSetup(s, "u1", { ...CLAUDE, provider: "openai" })).toBe(false);
    expect(saveAiSetup(s, "u1", { ...GPT, provider: "anthropic" })).toBe(false);
    expect(saveAiSetup(s, "u1", { ...GPT, model: "bad model" })).toBe(false);
    expect(saveAiSetup(s, "u1", { ...GPT, key: "hunter2" })).toBe(false);
    expect(s.m.size).toBe(0);
  });

  it("still reads a key saved before there was a choice of service (Anthropic, default model)", () => {
    const s = fakeStorage();
    s.setItem(AI_KEY_STORAGE, JSON.stringify({ userId: "u1", key: CLAUDE.key }));
    expect(readAiSetup(s, "u1")).toEqual({ provider: "anthropic", key: CLAUDE.key, model: "claude-haiku-5-5" });
  });

  it("ignores a damaged saved value, and falls back to the default model for a bad one", () => {
    const s = fakeStorage();
    s.setItem(AI_KEY_STORAGE, "{broken");
    expect(readAiSetup(s, "u1")).toBeNull();
    s.setItem(AI_KEY_STORAGE, JSON.stringify({ userId: "u1", provider: "openai", key: "hunter2", model: "x" }));
    expect(readAiSetup(s, "u1")).toBeNull();
    s.setItem(AI_KEY_STORAGE, JSON.stringify({ userId: "u1", provider: "anthropic", key: GPT.key, model: "x" }));
    expect(readAiSetup(s, "u1")).toBeNull(); // a key that does not match its stated service
    s.setItem(AI_KEY_STORAGE, JSON.stringify({ userId: "u1", provider: "openai", key: GPT.key, model: "bad model" }));
    expect(readAiSetup(s, "u1")?.model).toBe("gpt-4.1-nano");
    s.setItem(AI_KEY_STORAGE, JSON.stringify({ userId: "u1", provider: "nope", key: GPT.key }));
    expect(readAiSetup(s, "u1")).toBeNull();
  });

  it("can be removed, and a storage that throws never breaks anything", () => {
    const s = fakeStorage();
    saveAiSetup(s, "u1", GPT);
    clearAiKey(s);
    expect(readAiSetup(s, "u1")).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(saveAiSetup(broken, "u1", GPT)).toBe(false);
    expect(readAiSetup(broken, "u1")).toBeNull();
    expect(() => clearAiKey(broken)).not.toThrow();
  });
});

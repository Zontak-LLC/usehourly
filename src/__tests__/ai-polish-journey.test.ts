import { describe, expect, it, vi } from "vitest";

import { AI_KEY_STORAGE, clearAiKey, isAnthropicKey, readAiKey, saveAiKey } from "@/lib/ai-key";
import {
  AI_ENDPOINT,
  AI_MODEL,
  AiError,
  buildPolishRequest,
  POLISH_MAX_INPUT,
  parsePolishResponse,
  polishNote,
  testKey,
} from "@/lib/ai-polish";

/**
 * Issue #98: "Polish" a description with the person's own Anthropic key. The browser calls Anthropic directly, so what
 * matters is exactly what is sent (only the note and two names), that failures read as plain sentences that never carry
 * the service's own text, and that the key stays in this browser, for one account.
 */

const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
const input = { note: "fixed the nav bug on mobile", project: "Website", client: "Acme" };

const answer = (text: string) => new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 });
const fetchReturning = (res: Response) => vi.fn(async () => res) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("what is sent to Anthropic", () => {
  it("is a call from the browser with the person's own key, to Anthropic only", () => {
    const { url, init } = buildPolishRequest(KEY, input);
    expect(url).toBe(AI_ENDPOINT);
    expect(url.startsWith("https://api.anthropic.com/")).toBe(true);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(KEY);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });

  it("holds the note and the project and client names, and nothing else", () => {
    const body = JSON.parse(String(buildPolishRequest(KEY, input).init.body));
    expect(Object.keys(body).sort()).toEqual(["max_tokens", "messages", "model", "system"]);
    expect(body.model).toBe(AI_MODEL);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("Client: Acme\nProject: Website\nNote: fixed the nav bug on mobile");
    expect(JSON.stringify(body)).not.toContain(KEY); // the key is a header, never in the text
    expect(body.system).toMatch(/add nothing/i); // told not to invent facts
  });

  it("cuts a very long note, and keeps names on one short line", () => {
    const long = buildPolishRequest(KEY, {
      note: "x".repeat(POLISH_MAX_INPUT + 500),
      project: "Line one\nline two ".repeat(20),
      client: "Acme",
    });
    const content = JSON.parse(String(long.init.body)).messages[0].content as string;
    expect(content.split("\n")).toHaveLength(3); // client, project, note: a name cannot add lines
    expect(content.length).toBeLessThan(POLISH_MAX_INPUT + 250);
  });
});

describe("polishing a note", () => {
  it("returns the cleaned suggestion: no wrapping quotes, one line", async () => {
    const f = fetchReturning(answer('  "Fixed a navigation bug on mobile.\n"  '));
    expect(await polishNote(f, KEY, input)).toBe("Fixed a navigation bug on mobile.");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("does not call anything for an empty note", async () => {
    const f = fetchReturning(answer("x"));
    await expect(polishNote(f, KEY, { ...input, note: "   " })).rejects.toMatchObject({ kind: "empty" });
    expect(f).not.toHaveBeenCalled();
  });

  it("explains each failure in plain words and never repeats the service's own text", async () => {
    const secret = "internal detail req_9f8e7d: key sk-ant-leak";
    const cases: [number, string, string][] = [
      [401, "key", "refused that key"],
      [403, "key", "refused that key"],
      [429, "rate", "too fast"],
      [402, "credit", "no credit left"],
      [400, "credit", "no credit left"], // Anthropic reports an empty balance as a 400 with this wording
      [500, "other", "couldn't polish"],
    ];
    for (const [status, kind, words] of cases) {
      const text = status === 400 ? `Your credit balance is too low ${secret}` : secret;
      const f = fetchReturning(new Response(text, { status }));
      const err = (await polishNote(f, KEY, input).catch((e) => e)) as AiError;
      expect(err).toBeInstanceOf(AiError);
      expect(err.kind).toBe(kind);
      expect(err.message.toLowerCase()).toContain(words);
      expect(err.message).not.toContain("req_9f8e7d");
      expect(err.message).not.toContain("sk-ant");
    }
  });

  it("says so when it cannot reach Anthropic, but lets a cancelled call stay a cancel", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(polishNote(offline, KEY, input)).rejects.toMatchObject({ kind: "network" });
    const aborted = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;
    await expect(polishNote(aborted, KEY, input)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("copes with an answer that is empty or not JSON", async () => {
    await expect(polishNote(fetchReturning(answer("   ")), KEY, input)).rejects.toMatchObject({ kind: "empty" });
    await expect(polishNote(fetchReturning(new Response("<html>", { status: 200 })), KEY, input)).rejects.toMatchObject(
      {
        kind: "other",
      },
    );
    expect(() => parsePolishResponse({ content: [] })).toThrow(AiError);
    expect(() => parsePolishResponse(null)).toThrow(AiError);
  });

  it("tests a key with one tiny call", async () => {
    const f = fetchReturning(answer("Fixed a bug."));
    await expect(testKey(f, KEY)).resolves.toBeUndefined();
    expect(f).toHaveBeenCalledTimes(1);
    await expect(testKey(fetchReturning(new Response("no", { status: 401 })), KEY)).rejects.toMatchObject({
      kind: "key",
    });
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

  it("only looks like a key when it is one", () => {
    expect(isAnthropicKey(KEY)).toBe(true);
    expect(isAnthropicKey(`  ${KEY}  `)).toBe(true);
    for (const bad of [
      "",
      "sk-ant-short",
      "sk-proj-abcdefghijklmnopqrstuvwxyz",
      "hunter2",
      "sk-ant- spaced key here 1234",
    ]) {
      expect(isAnthropicKey(bad)).toBe(false);
    }
  });

  it("is read back only by the account that saved it", () => {
    const s = fakeStorage();
    expect(saveAiKey(s, "u1", KEY)).toBe(true);
    expect(readAiKey(s, "u1")).toBe(KEY);
    expect(readAiKey(s, "u2")).toBeNull(); // another account on the same device never gets it
    expect(readAiKey(s, null)).toBeNull();
    expect(readAiKey(null, "u1")).toBeNull();
  });

  it("refuses something that is not a key and ignores a damaged saved value", () => {
    const s = fakeStorage();
    expect(saveAiKey(s, "u1", "not a key")).toBe(false);
    expect(s.m.size).toBe(0);
    s.setItem(AI_KEY_STORAGE, "{broken");
    expect(readAiKey(s, "u1")).toBeNull();
    s.setItem(AI_KEY_STORAGE, JSON.stringify({ userId: "u1", key: "hunter2" }));
    expect(readAiKey(s, "u1")).toBeNull();
  });

  it("can be removed, and a storage that throws never breaks anything", () => {
    const s = fakeStorage();
    saveAiKey(s, "u1", KEY);
    clearAiKey(s);
    expect(readAiKey(s, "u1")).toBeNull();
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
    expect(saveAiKey(broken, "u1", KEY)).toBe(false);
    expect(readAiKey(broken, "u1")).toBeNull();
    expect(() => clearAiKey(broken)).not.toThrow();
  });
});

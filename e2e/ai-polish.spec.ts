import { FEATURES } from "../src/lib/features";
import { expect, startFreshAccount, test } from "./helpers";

test.skip(!FEATURES.aiPolish, "Polish with your own AI key is hidden in this release (src/lib/features.ts)");

const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
const OPENAI_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789_-ABC";
const reply = (text: string) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ content: [{ type: "text", text }] }),
});

/** Issue #98: with the person's own Anthropic key, a Polish button tidies a description; the result fills the box, and the person keeps it or undoes it. */
test("polish a description with your own AI key (Anthropic or OpenAI): save the key, choose a model, polish in place, keep or undo, remove the key", async ({
  page,
  shot,
}) => {
  await startFreshAccount(page, "Fernhill");
  const calls: { headers: Record<string, string>; body: { model: string; messages: { content: string }[] } }[] = [];
  await page.route("https://api.anthropic.com/**", async (route) => {
    const req = route.request();
    calls.push({ headers: req.headers(), body: req.postDataJSON() });
    if (req.postDataJSON().model === "nonexistent-model") {
      await route.fulfill({ status: 401, contentType: "application/json", body: "{}" }); // (a 404 would log a browser error and fail the run)
      return;
    }
    const note = String(req.postDataJSON().messages[0].content);
    await route.fulfill(
      note.includes("Note: fixed bug")
        ? reply("Fixed a bug.")
        : note.includes("refuse me")
          ? { status: 401, contentType: "application/json", body: "{}" }
          : reply("Reworked the homepage layout and fixed the navigation bug on mobile."),
    );
  });

  const openaiCalls: {
    headers: Record<string, string>;
    body: { model: string; messages: { role: string; content: string }[] };
  }[] = [];
  await page.route("https://api.openai.com/**", async (route) => {
    const req = route.request();
    openaiCalls.push({ headers: req.headers(), body: req.postDataJSON() });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { role: "assistant", content: "Polished by ChatGPT." } }] }),
    });
  });

  await test.step("the description box is two lines tall by default", async () => {
    const box = await page.getByLabel("Description").boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(70); // two lines of text, not one
  });

  await test.step("without a key there is no Polish button", async () => {
    await page.getByLabel("Description").fill("homepage layout, fixed nav bug on mobile");
    await expect(page.getByRole("button", { name: /Polish/ })).toHaveCount(0);
  });

  await test.step("a key that is not an Anthropic key is refused before any call", async () => {
    await page.goto("/dashboard/account#ai");
    await page.getByLabel("API key", { exact: true }).fill("hunter2");
    await page.getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByText(/doesn't look like an Anthropic API key/)).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  await test.step("a good key is checked with one call, then saved on this device", async () => {
    await page.getByLabel("API key", { exact: true }).fill(KEY);
    await page.getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByText(/Key saved on this device/)).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0].headers["x-api-key"]).toBe(KEY);
    await expect(page.getByText(/Using Anthropic \(Claude\) with a key saved on this device/)).toBeVisible();
    await expect(page.getByLabel("API key", { exact: true })).toHaveCount(0); // the key is not shown again
  });

  await test.step("Polish fills the box in place; Undo puts the note back", async () => {
    await page.goto("/dashboard/today");
    const box = page.getByLabel("Description");
    await box.fill("homepage layout, fixed nav bug on mobile");
    // the button sits inside the right edge of the box, on the same line as the text
    const field = await box.boundingBox();
    const button = await page.getByRole("button", { name: /Polish/ }).boundingBox();
    expect(
      button && field && button.x + button.width <= field.x + field.width && button.x > field.x + field.width / 2,
    ).toBe(true);
    expect(button && field && button.y >= field.y && button.y + button.height <= field.y + field.height).toBe(true);
    await page.getByRole("button", { name: /Polish/ }).click();
    await expect(box).toHaveValue(/Reworked the homepage layout/); // the polished text is in the box itself
    await expect(page.getByRole("button", { name: "Keep", exact: true })).toBeVisible();
    await shot("polish-suggestion-in-box");
    const sent = calls.at(-1)?.body.messages[0].content ?? "";
    expect(sent).toBe("Client: Fernhill\nProject: General\nNote: homepage layout, fixed nav bug on mobile");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(box).toHaveValue("homepage layout, fixed nav bug on mobile");
    await expect(page.getByRole("button", { name: "Keep", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Polish/ })).toBeVisible();
  });

  await test.step("Keep leaves the polished text in the box, and the entry is saved with it", async () => {
    await page.getByRole("button", { name: /Polish/ }).click();
    await expect(page.getByLabel("Description")).toHaveValue(/Reworked the homepage layout/);
    await page.getByRole("button", { name: "Keep", exact: true }).click();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Description")).toHaveValue(/Reworked the homepage layout/);
    await page.getByLabel("Time to add").fill("1h");
    await page.getByRole("button", { name: /Log time/ }).click();
    await expect(page.getByText(/Reworked the homepage layout/).first()).toBeVisible();
  });

  await test.step("a refused key says so in plain words", async () => {
    await page.getByLabel("Description").fill("refuse me");
    await page.getByRole("button", { name: /Polish/ }).click();
    await expect(page.getByText(/Anthropic refused that key/)).toBeVisible();
    await expect(page.getByLabel("Description")).toHaveValue("refuse me"); // the note is untouched
  });

  await test.step("Polish is also on an entry being edited", async () => {
    await page
      .getByText(/Reworked the homepage layout/)
      .first()
      .hover();
    const row = page.getByRole("listitem").filter({ hasText: "Reworked the homepage layout" });
    await expect(row).not.toHaveAttribute("aria-busy", "true"); // a row the server has not confirmed yet cannot be edited
    const edit = row.getByRole("button", { name: "Edit", exact: true });
    // the list is refreshed after a save and the row is swapped for the confirmed one: let that finish, or the form closes again
    await page.waitForLoadState("networkidle");
    await edit.focus(); // by keyboard: a toast can sit over the pencil and take a mouse click
    await page.keyboard.press("Enter");
    await expect(edit).toHaveAttribute("aria-expanded", "true");
    // one in the add form and one in the entry's own edit form
    await expect(
      page.getByRole("region", { name: "Today's entries" }).getByRole("button", { name: /Polish/ }),
    ).toBeVisible();
  });

  await test.step("the model can be changed without entering the key again", async () => {
    await page.goto("/dashboard/account#ai");
    await expect(page.getByLabel("Model", { exact: true })).toHaveValue("claude-haiku-5-5"); // the cheapest is the default
    const before = calls.length;
    await page.getByLabel("Model", { exact: true }).selectOption("claude-sonnet-5-5");
    await expect(page.getByText(/Checked: Polish now uses claude-sonnet-5-5/)).toBeVisible(); // proven with one call first
    expect(calls.length).toBe(before + 1);
    expect(calls.at(-1)?.body.model).toBe("claude-sonnet-5-5");
    await page.goto("/dashboard/today");
    await page.getByLabel("Description").fill("sonnet please");
    await page.getByRole("button", { name: /Polish/ }).click();
    await expect(page.getByLabel("Description")).toHaveValue(/Reworked the homepage layout/);
    expect(calls.at(-1)?.body.model).toBe("claude-sonnet-5-5");
  });

  await test.step("a model that fails the check is refused, and the old one stays", async () => {
    await page.goto("/dashboard/account#ai");
    await page.getByLabel("Model", { exact: true }).selectOption({ label: "Other model…" });
    await page.getByLabel("Model name").fill("nonexistent-model");
    await page.getByLabel("Model name").press("Enter");
    await expect(page.getByText(/Anthropic refused that key/).first()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Model", { exact: true })).toHaveValue("claude-sonnet-5-5"); // unchanged
  });

  await test.step("an OpenAI key works the same way, on its own default model", async () => {
    await page.goto("/dashboard/account#ai");
    await page.getByRole("button", { name: "Remove key" }).click();
    await page.getByLabel("AI service").selectOption("openai");
    await expect(page.getByLabel("Model", { exact: true })).toHaveValue("gpt-4.1-nano");
    await page.getByLabel("API key", { exact: true }).fill(KEY); // an Anthropic key under OpenAI is refused first
    await page.getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByText(/doesn't look like an OpenAI API key/)).toBeVisible();
    await page.getByLabel("API key", { exact: true }).fill(OPENAI_KEY);
    await page.getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByText(/Key saved on this device/)).toBeVisible();
    await expect(page.getByText(/Using OpenAI \(ChatGPT\)/)).toBeVisible();
    await page.goto("/dashboard/today");
    await page.getByLabel("Description").fill("chatgpt please");
    await page.getByRole("button", { name: /Polish/ }).click();
    await expect(page.getByLabel("Description")).toHaveValue("Polished by ChatGPT.");
    const sent = openaiCalls.at(-1);
    expect(sent?.headers.authorization).toBe(`Bearer ${OPENAI_KEY}`);
    expect(sent?.body.model).toBe("gpt-4.1-nano");
    const user = sent?.body.messages.find((m) => m.role === "user")?.content;
    expect(user).toBe("Client: Fernhill\nProject: General\nNote: chatgpt please");
  });

  await test.step("removing the key takes Polish away again", async () => {
    await page.goto("/dashboard/account#ai");
    await page.getByRole("button", { name: "Remove key" }).click();
    await expect(page.getByLabel("API key", { exact: true })).toBeVisible();
    await page.goto("/dashboard/today");
    await page.getByLabel("Description").fill("anything");
    await expect(page.getByRole("button", { name: /Polish/ })).toHaveCount(0);
  });
});

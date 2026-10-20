import { expect, startFreshAccount, test } from "./helpers";

const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
const reply = (text: string) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ content: [{ type: "text", text }] }),
});

/** Issue #98: with the person's own Anthropic key, a Polish button tidies a description; nothing changes until Use this. */
test("polish a description with your own AI key: save the key, polish, use or discard, remove the key", async ({
  page,
}) => {
  await startFreshAccount(page, "Fernhill");
  const calls: { headers: Record<string, string>; body: { messages: { content: string }[] } }[] = [];
  await page.route("https://api.anthropic.com/**", async (route) => {
    const req = route.request();
    calls.push({ headers: req.headers(), body: req.postDataJSON() });
    const note = String(req.postDataJSON().messages[0].content);
    await route.fulfill(
      note.includes("Note: fixed bug")
        ? reply("Fixed a bug.")
        : note.includes("refuse me")
          ? { status: 401, contentType: "application/json", body: "{}" }
          : reply("Reworked the homepage layout and fixed the navigation bug on mobile."),
    );
  });

  await test.step("without a key there is no Polish button", async () => {
    await page.getByLabel("Description").fill("homepage layout, fixed nav bug on mobile");
    await expect(page.getByRole("button", { name: /Polish/ })).toHaveCount(0);
  });

  await test.step("a key that is not an Anthropic key is refused before any call", async () => {
    await page.goto("/dashboard/account");
    await page.getByLabel("Anthropic API key").fill("hunter2");
    await page.getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByText(/doesn't look like an Anthropic API key/)).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  await test.step("a good key is checked with one call, then saved on this device", async () => {
    await page.getByLabel("Anthropic API key").fill(KEY);
    await page.getByRole("button", { name: "Check and save" }).click();
    await expect(page.getByText(/Key saved on this device/)).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0].headers["x-api-key"]).toBe(KEY);
    await expect(page.getByText(/A key is saved on this device/)).toBeVisible();
    await expect(page.getByLabel("Anthropic API key")).toHaveCount(0); // the key is not shown again
  });

  await test.step("Polish shows a suggestion; Discard leaves the note as it was", async () => {
    await page.goto("/dashboard/today");
    const box = page.getByLabel("Description");
    await box.fill("homepage layout, fixed nav bug on mobile");
    await page.getByRole("button", { name: /Polish/ }).click();
    await expect(page.getByTestId("polish-suggestion")).toHaveText(/Reworked the homepage layout/);
    const sent = calls.at(-1)?.body.messages[0].content ?? "";
    expect(sent).toBe("Client: Fernhill\nProject: General\nNote: homepage layout, fixed nav bug on mobile");
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByTestId("polish-suggestion")).toHaveCount(0);
    await expect(box).toHaveValue("homepage layout, fixed nav bug on mobile");
  });

  await test.step("Use this puts the suggestion in the box, and the entry is saved with it", async () => {
    await page.getByRole("button", { name: /Polish/ }).click();
    await page.getByRole("button", { name: "Use this" }).click();
    await expect(page.getByLabel("Description")).toHaveValue(/Reworked the homepage layout/);
    await page.getByLabel("Time to add").fill("1h");
    await page.getByRole("button", { name: /Add to the day/ }).click();
    await expect(page.getByText(/Reworked the homepage layout/).first()).toBeVisible();
  });

  await test.step("a refused key says so in plain words", async () => {
    await page.getByLabel("Description").fill("refuse me");
    await page.getByRole("button", { name: /Polish/ }).click();
    await expect(page.getByText(/Anthropic refused that key/)).toBeVisible();
    await expect(page.getByTestId("polish-suggestion")).toHaveCount(0);
  });

  await test.step("Polish is also on an entry being edited", async () => {
    await page
      .getByText(/Reworked the homepage layout/)
      .first()
      .hover();
    await page
      .getByRole("listitem")
      .filter({ hasText: "Reworked the homepage layout" })
      .getByRole("button", { name: "Edit", exact: true })
      .click({ force: true });
    // one in the add form and one in the entry's own edit form
    await expect(
      page.getByRole("region", { name: "Today's timesheet" }).getByRole("button", { name: /Polish/ }),
    ).toBeVisible();
  });

  await test.step("removing the key takes Polish away again", async () => {
    await page.goto("/dashboard/account");
    await page.getByRole("button", { name: "Remove key" }).click();
    await expect(page.getByLabel("Anthropic API key")).toBeVisible();
    await page.goto("/dashboard/today");
    await page.getByLabel("Description").fill("anything");
    await expect(page.getByRole("button", { name: /Polish/ })).toHaveCount(0);
  });
});

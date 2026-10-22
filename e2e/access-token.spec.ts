import { expect, startFreshAccount, test } from "./helpers";

/** Account > AI assistants: the connect steps, and the small form that makes an access token. */
test("an assistant is connected in words, and a token is made, shown once, listed and revoked", async ({
  page,
  shot,
}) => {
  await startFreshAccount(page, "Acme");
  await page.goto("/dashboard/account#ai");

  // The steps are plain words for the chosen assistant, with the server address to copy.
  await expect(page.getByRole("heading", { name: "Connect your assistant" })).toBeVisible();
  await expect(page.getByText("Open Claude (the website or the desktop app)")).toBeVisible();
  await page.getByRole("button", { name: "Claude Code" }).first().click();
  await expect(page.getByText("claude mcp add --transport http usehourly").first()).toBeVisible();

  // The token form: one-tap name, a clear choice of what it may do, how long it lives.
  await expect(page.getByText("No tokens yet.")).toBeVisible();
  const make = page.getByRole("button", { name: "Make token" });
  await page.getByRole("button", { name: "Cursor", exact: true }).last().click();
  await expect(page.getByLabel("What is it for?")).toHaveValue("Cursor");
  await page.getByLabel(/Read and change/).check({ force: true });
  await page.getByRole("button", { name: "1 year" }).click();
  await make.click();

  await expect(page.getByText("Copy your new token now.")).toBeVisible();
  await expect(page.getByText(/uh_[A-Za-z0-9_-]{20,}/).first()).toBeVisible();
  await shot("token-made");
  await page.getByRole("button", { name: "I've saved it" }).click();
  await expect(page.getByText("Copy your new token now.")).toHaveCount(0);
  await expect(page.getByText("Cursor").last()).toBeVisible(); // the row stays, without the secret

  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Yes, revoke" }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
});

test("a long list of tokens is paged, three to a page on a phone", async ({ page }) => {
  await startFreshAccount(page, "Acme");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/dashboard/account#ai");
  const rows = page.getByRole("list").filter({ hasText: "Revoke" }).getByRole("listitem");
  for (let i = 1; i <= 4; i++) {
    await page.getByLabel("What is it for?").fill(`Helper ${i}`);
    await page.getByRole("button", { name: "Make token" }).click();
    await page.getByRole("button", { name: "I've saved it" }).click();
    await expect(page.getByText("Copy your new token now.")).toHaveCount(0);
  }
  await expect(rows).toHaveCount(3); // page 1 of 2
  const pager = page.getByRole("navigation", { name: "tokens pages" });
  await expect(pager).toContainText("1 to 3 of 4");
  await pager.getByRole("button", { name: /Next/ }).click();
  await expect(rows).toHaveCount(1); // the fourth token is on page 2
  await expect(pager).toContainText("4 to 4 of 4");
});

import { expect, sql, startFreshAccount, test } from "./helpers";

/** Account > API tokens & AI: the connect steps, and the small form that makes an access token. */
test("an assistant is connected in words, and a token is made, shown once, listed and deleted", async ({
  page,
  shot,
}) => {
  await startFreshAccount(page, "Acme");
  await page.goto("/dashboard/account#ai");

  // Short steps for the chosen assistant, each with its link or the text to copy right there.
  await expect(page.getByRole("heading", { name: "Connect your assistant" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Claude connectors" })).toHaveAttribute(
    "href",
    "https://claude.ai/settings/connectors",
  );
  await expect(page.getByText(/\/api\/mcp$/).first()).toBeVisible(); // the address to paste
  await page.getByRole("heading", { name: "Connect your assistant" }).scrollIntoViewIfNeeded();
  await shot("connect-steps");
  await page.getByRole("button", { name: "Cursor" }).first().click();
  const cursor = await page.getByRole("link", { name: "Add to Cursor" }).getAttribute("href");
  expect(cursor).toMatch(/^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=usehourly&config=/);
  const config = JSON.parse(Buffer.from(decodeURIComponent(cursor?.split("config=")[1] ?? ""), "base64").toString());
  expect(config.url).toMatch(/\/api\/mcp$/);
  await page.getByRole("button", { name: "Claude Code" }).first().click();
  await expect(page.getByText("claude mcp add --transport http usehourly").first()).toBeVisible();
  // VS Code: a one-click install link carrying the server's settings, and the Command Palette way as a fallback.
  await page.getByRole("button", { name: "VS Code" }).click();
  const vscode = (await page.getByRole("link", { name: "Add to VS Code" }).getAttribute("href")) ?? "";
  expect(vscode).toMatch(/^vscode:mcp\/install\?/);
  const server = JSON.parse(decodeURIComponent(vscode.split("?")[1]));
  expect(server).toMatchObject({ name: "usehourly", type: "http" });
  expect(server.url).toMatch(/^http.*\/api\/mcp$/);
  await expect(page.getByText(/MCP: Add Server/)).toBeVisible();
  // Devin Desktop (formerly Windsurf): the entry to paste into its MCP config file.
  await page.getByRole("button", { name: "Devin Desktop (Windsurf)" }).click();
  await expect(page.getByText(/"usehourly": \{ "url": "http.*\/api\/mcp" \}/)).toBeVisible();
  // Any other MCP app: the address and the sign-in.
  await page.getByRole("button", { name: "Another app" }).first().click();
  await expect(page.getByText(/Any app that supports MCP works/)).toBeVisible();
  await expect(page.getByText(/\/api\/mcp$/).first()).toBeVisible();

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

  // Delete asks once for an active token (anything using it stops), then the row is gone.
  await page.getByRole("button", { name: "Delete Cursor" }).click();
  await expect(page.getByText("Anything using it stops working right away.")).toBeVisible();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.getByRole("button", { name: "Delete Cursor" })).toBeVisible(); // kept
  await page.getByRole("button", { name: "Delete Cursor" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText("No tokens yet.")).toBeVisible();
});

test("a long list of tokens is paged, three to a page on a phone", async ({ page }) => {
  const user = await startFreshAccount(page, "Acme");
  // Four tokens put straight into the database (making four through the form is slow on a busy machine and tests
  // nothing about paging).
  const now = Math.floor(Date.now() / 1000);
  for (let i = 1; i <= 4; i++) {
    sql(
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, access, token_version, expires_at)
       SELECT 'e2e-tok-${i}-' || id, id, 'Helper ${i}', 'e2e-hash-${i}-' || id, 'uh_e2e${i}', 'read', token_version, ${now + 86400 * 30}
       FROM auth_users WHERE email='${user.email}'`,
    );
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/dashboard/account#ai");
  const rows = page.getByRole("list").filter({ hasText: "Delete" }).getByRole("listitem");
  await expect(rows).toHaveCount(3); // page 1 of 2
  const pager = page.getByRole("navigation", { name: "tokens pages" });
  await expect(pager).toContainText("1 to 3 of 4");
  await pager.getByRole("button", { name: /Next/ }).click();
  await expect(rows).toHaveCount(1); // the fourth token is on page 2
  await expect(pager).toContainText("4 to 4 of 4");
});

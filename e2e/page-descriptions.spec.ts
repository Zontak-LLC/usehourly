import { expect, signUpByApi, test } from "./helpers";

/**
 * Issue 167: a page's one-line description shows on a phone only when it carries information. The empty Clients page's
 * sentence ("Your clients and the projects you log time on…") took two lines on a phone and said nothing the page
 * did not; once there is a client, the count line ("1 client") is information and shows everywhere.
 */
test("the empty Clients sentence stays off a phone, and the count line shows on every screen", async ({
  page,
  isMobile,
}) => {
  await signUpByApi(page);
  await page.goto("/dashboard/clients");
  await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();
  const header = page.getByRole("heading", { name: "Clients", level: 1 }).locator("xpath=ancestor::header[1]");
  const sentence = header.getByText(/the projects you log time on/);

  await test.step("no clients: the sentence shows on a computer only", async () => {
    if (isMobile) await expect(sentence).toBeHidden();
    else await expect(sentence).toBeVisible();
  });

  await test.step("one client: the count line shows on a phone too", async () => {
    const made = await page.request.post("/api/trpc/clients.create", { data: { name: "Acme Studio" } });
    expect(made.ok(), `clients.create answered ${made.status()}`).toBe(true);
    await page.reload();
    await expect(header.getByText(/^1 client/)).toBeVisible();
    await expect(sentence).toHaveCount(0);
  });
});

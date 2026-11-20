import { expect, test } from "./helpers";

/**
 * The proxy skips static files by name, never by file ending: a page address that happens to end in `.png` or `.txt`
 * still gets the sign-in check and the per-request nonce policy, and a real static file is still served as it is.
 */

test("a signed-out visitor to a dashboard address ending in .png is sent to log in", async ({ request }) => {
  const res = await request.get("/dashboard/clients/abc.png", { maxRedirects: 0 });
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(400);
  expect(res.headers().location).toMatch(/\/auth\/v2\/login$/);
});

test("a page address ending in .txt gets the nonce policy", async ({ request }) => {
  const res = await request.get("/help/guide.txt");
  expect(res.headers()["content-security-policy"]).toContain("'nonce-");
});

test("a real static file is still served, with no redirect", async ({ request }) => {
  const res = await request.get("/icons/icon-192.png", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
});

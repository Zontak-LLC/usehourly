import { expect, test } from "./helpers";

/**
 * Incident usehourly:9bef45d27c59b510: bots post multipart forms to pages with no `next-action` header. Next's action
 * handler then writes "Error: Invalid Server Actions request." with console.warn and answers 400 with
 * `x-nextjs-action-not-found: 1`. The proxy now refuses such a post first, so that header (Next's sign) never comes.
 */
const PAGES = ["/", "/auth/v2/login"];

for (const path of PAGES) {
  test(`a multipart post with no action id to ${path} is refused before Next's action handler`, async ({ request }) => {
    const res = await request.post(path, { multipart: { name: "x" }, maxRedirects: 0 });
    expect(res.status()).toBe(400);
    expect(res.headers()["x-nextjs-action-not-found"]).toBeUndefined();
    expect(await res.text()).toBe("Bad request");
  });
}

test("a urlencoded post to / is not refused by the guard", async ({ request }) => {
  const res = await request.post("/", { form: { name: "x" }, maxRedirects: 0 });
  const refusedByGuard = res.status() === 400 && (await res.text()) === "Bad request";
  expect(refusedByGuard).toBe(false);
});

test("a plain GET of / still answers 200", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
});

import { FEATURES } from "../src/lib/features";
import { allMail, expect, mailWhere, signUpReady, startFreshAccount, test } from "./helpers";

const GITHUB_ISSUES = 'a[href*="github.com/Zontak-LLC/usehourly/issues"]';

/** The Help page (issue #216): one search box, six common questions that open in place, and old guide links that still land. */
test("a visitor finds an answer by searching, opens it in place, and old guide links still land", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search help" });
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Help", level: 1 })).toBeVisible();

  await test.step("the common questions show first, and one opens and closes in place", async () => {
    await expect(page.getByRole("heading", { name: "Common questions" })).toBeVisible();
    const free = page.getByRole("button", { name: "Is UseHourly really free?" });
    await expect(free).toHaveAttribute("aria-expanded", "false");
    await free.click();
    await expect(free).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/no paid plans/i)).toBeVisible();
    await free.click();
    await expect(page.getByText(/no paid plans/i)).toBeHidden();
    await expect(page.getByRole("button", { name: /^(How|Can|Who|Is)/ })).toHaveCount(6);
  });

  await test.step("searching finds deeper answers as you type, with the matching words marked", async () => {
    await search.fill("hourly rate");
    await expect(page.getByRole("heading", { name: /answers?$/ })).toBeVisible();
    const rate = page.getByRole("button", { name: "Where do I set my hourly rate?" });
    await expect(rate.locator("mark").first()).toHaveText(/hourly/i);
    await rate.click();
    await expect(page.getByText(/drag the slider or type it/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Common questions" })).toHaveCount(0);
  });

  await test.step("nothing found says so; emptying the box brings the common questions back (no × button)", async () => {
    await search.fill("zzzzqqq");
    await expect(page.getByRole("heading", { name: "No answer matches “zzzzqqq”" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear search" })).toHaveCount(0);
    await search.fill("");
    await expect(page.getByRole("heading", { name: "Common questions" })).toBeVisible();
  });

  await test.step("a link inside an answer opens the other answer on the same page", async () => {
    await page.getByRole("button", { name: "Can I use it on my phone, and offline?" }).click();
    await page.getByRole("link", { name: "Working offline" }).click();
    await expect(page).toHaveURL(/\/help\?a=offline$/);
    await expect(page.getByRole("button", { name: "What works offline, with no connection?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // the same link again, from a search, while the address already says ?a=offline: it still opens the answer
    await search.fill("phone");
    await expect(page.getByRole("button", { name: "Can I use it on my phone, and offline?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    ); // still open from before
    await page.getByRole("link", { name: "Working offline" }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByRole("button", { name: "What works offline, with no connection?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  await test.step("an old topic address opens the answer that replaced it", async () => {
    await page.goto("/help/making-an-invoice");
    await expect(page).toHaveURL(/\/help\?a=invoice$/);
    await expect(page.getByRole("button", { name: "How do I make an invoice and send it?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  await test.step("an old FAQ anchor opens its answer, and an unknown topic becomes a search", async () => {
    await page.goto("/help/faq#export");
    await expect(page).toHaveURL(/\/help#export$/);
    await expect(page.getByRole("button", { name: "Can I get my data out, or delete my account?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.goto("/help/not-a-topic");
    await expect(page).toHaveURL(/\/help\?q=not%20a%20topic$/);
    await expect(search).toHaveValue("not a topic");
    if (!FEATURES.rounding) {
      await page.goto("/help/rounding"); // a topic about a hidden feature finds the visible answer
      await expect(page.getByRole("button", { name: "Does it round my time?" })).toBeVisible();
    }
  });

  await test.step("a visitor with no account sees a plain header, not the app's pages", async () => {
    await expect(page.getByRole("navigation", { name: "Main pages" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/auth/v2/login");
    await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/auth/v2/register");
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
  });
});

test("the app links to Help from the account menu and the side menu, and no ? button is left in the top bar", async ({
  page,
}) => {
  await startFreshAccount(page);
  await test.step("the top bar has no ? button any more", async () => {
    await expect(page.getByRole("link", { name: "Guide and FAQ" })).toHaveCount(0);
  });

  await test.step("the account menu has Help", async () => {
    await page.getByRole("button", { name: /^Account menu for/ }).click();
    await page.getByRole("menuitem", { name: "Help" }).click();
    await expect(page).toHaveURL(/\/help$/);
  });

  await test.step("Help keeps the app's navigation for a signed-in person, with nothing personal in it", async () => {
    const tabs = page.getByRole("navigation", { name: "Main pages" });
    await expect(tabs.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/dashboard/today");
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
    await expect(tabs.getByRole("button", { name: "More" })).toHaveCount(0); // every page is a tab now (issue 217)
    await expect(page.getByRole("button", { name: /^Account menu for/ })).toHaveCount(0);
  });

  await test.step("the Export menu no longer sends people to read about it", async () => {
    await page.goto("/dashboard/week");
    await page.getByRole("button", { name: /^(Share & export|Export)$/ }).click();
    await expect(page.getByRole("menuitem", { name: "Which one do I use?" })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });
});

/** "Ask a question" (issue 375): a form on Help that emails support, instead of a GitHub link most people cannot use. */
const QUESTION = "I logged 2h on Monday and Week shows 0:00";
const LABEL = "What did you do, and what did you expect?";

/** A tRPC error answer for help.ask, the shape the server sends. */
const refuse = (code: string, message: string) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([{ error: { message, code: -32600, data: { code, httpStatus: 400 } } }]),
});

test("a signed-in person asks a question on Help, and it is emailed to support with replies going to them", async ({
  page,
}) => {
  const user = await signUpReady(page);
  await page.goto("/help");
  const aside = page.getByRole("complementary", { name: "Still stuck?" });
  const box = aside.getByRole("textbox", { name: LABEL });
  const send = aside.getByRole("button", { name: "Send" });
  await expect(page.locator(GITHUB_ISSUES)).toHaveCount(0);

  await test.step("the button opens the form in place, with the cursor in the box; Send is off while it is empty", async () => {
    await aside.getByRole("button", { name: "Ask a question" }).click();
    await expect(box).toBeFocused();
    await expect(send).toBeDisabled();
    await box.fill("   ");
    await expect(send).toBeDisabled();
  });

  await test.step("the count shows from 1,800 characters, and the box takes no more than 2,000", async () => {
    await box.fill("x".repeat(1799));
    await expect(aside.getByText(/ of 2,000$/)).toHaveCount(0);
    await box.fill("x".repeat(1850));
    await expect(aside.getByText("1,850 of 2,000")).toBeVisible();
    await box.fill("x".repeat(1999));
    await box.pressSequentially("abc");
    await expect(box).toHaveValue(`${"x".repeat(1999)}a`);
    await expect(aside.getByText("2,000 of 2,000")).toBeVisible();
  });

  await test.step("Escape closes the form and keeps the text while the page stays open", async () => {
    await box.fill(QUESTION);
    await box.press("Escape");
    await expect(box).toHaveCount(0);
    await aside.getByRole("button", { name: "Ask a question" }).click();
    await expect(box).toHaveValue(QUESTION);
  });

  await test.step("Send emails it to support, with reply-to set to the account's address", async () => {
    await send.click();
    await expect(aside.getByRole("status")).toHaveText("Thanks, we got it. We'll answer by email.");
    // filtered by reply_to: specs run side by side and all send their questions to the same support address
    const mail = await mailWhere((m) => m.reply_to === user.email, `with reply-to ${user.email}`);
    expect(mail.to).toBe("admin@zontakllc.com");
    expect(mail.text).toContain(QUESTION);
    expect(mail.text).toContain(user.email);
    expect((await allMail()).filter((m) => m.reply_to === user.email)).toHaveLength(1);
  });

  await test.step("Ask another question opens an empty form", async () => {
    await aside.getByRole("button", { name: "Ask another question" }).click();
    await expect(box).toHaveValue("");
    await expect(box).toBeFocused();
  });
});

test("a send that fails says so plainly under the box and keeps the text; an ended session asks to sign in", async ({
  page,
}) => {
  await signUpReady(page);
  await page.goto("/help");
  const aside = page.getByRole("complementary", { name: "Still stuck?" });
  const box = aside.getByRole("textbox", { name: LABEL });
  await aside.getByRole("button", { name: "Ask a question" }).click();
  await box.fill(QUESTION);

  for (const [code, message, shown] of [
    [
      "PRECONDITION_FAILED",
      "Email isn't set up on this server yet.",
      "Email isn't set up on this server yet. Please write to admin@zontakllc.com.",
    ],
    [
      "INTERNAL_SERVER_ERROR",
      "Something went wrong. Please try again.", // what the server's error formatter leaves of a failed send
      "Couldn't send it right now. Please try again in a minute, or write to admin@zontakllc.com.",
    ],
  ]) {
    await page.unroute("**/api/trpc/help.ask*");
    await page.route("**/api/trpc/help.ask*", (route) => route.fulfill(refuse(code, message)));
    await aside.getByRole("button", { name: "Send" }).click();
    await expect(aside.getByRole("alert")).toHaveText(shown);
    await expect(aside.getByRole("alert").getByRole("link", { name: "admin@zontakllc.com" })).toHaveAttribute(
      "href",
      "mailto:admin@zontakllc.com",
    );
    await expect(box).toHaveValue(QUESTION);
  }

  await page.unroute("**/api/trpc/help.ask*");
  await page.route("**/api/trpc/help.ask*", (route) => route.fulfill(refuse("UNAUTHORIZED", "Please sign in.")));
  await aside.getByRole("button", { name: "Send" }).click();
  await expect(aside.getByRole("link", { name: "Sign in to ask a question" })).toHaveAttribute(
    "href",
    "/auth/v2/login?next=/help",
  );
  await expect(box).toHaveCount(0);
});

test("a visitor with no account is asked to sign in, and gets no form", async ({ page }) => {
  await page.goto("/help");
  const aside = page.getByRole("complementary", { name: "Still stuck?" });
  await expect(aside.getByRole("link", { name: "Sign in to ask a question" })).toHaveAttribute(
    "href",
    "/auth/v2/login?next=/help",
  );
  await expect(page.locator(GITHUB_ISSUES)).toHaveCount(0);
  await expect(aside.getByRole("textbox")).toHaveCount(0);
  await expect(aside.getByRole("button", { name: "Send" })).toHaveCount(0);
  await expect(aside.getByRole("button", { name: "Ask a question" })).toHaveCount(0);
});

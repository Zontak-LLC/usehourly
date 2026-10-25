import { test as setup } from "@playwright/test";

import { SHARED_STATE, signUpReady } from "./helpers";

/**
 * The "shared-account" project (issue 340): one account for the whole run, made once before desktop and phone start.
 * The spec files that only read their own, uniquely named data (`withSharedAccount()` in e2e/helpers.ts) sign in with its
 * saved state instead of signing up again. Its address starts "e2e-", so e2e/global-teardown.ts deletes it.
 * Plain Playwright `test`, not the helpers' one: its `nav_position` cookie is added on top of the state by every test.
 */
setup("sign up the account the shared specs use", async ({ page }) => {
  await signUpReady(page);
  await page.context().storageState({ path: SHARED_STATE });
});

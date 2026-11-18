import type { Page } from "@playwright/test";

const STORE = "__cspViolations";

/**
 * Records every Content-Security-Policy violation on the page's next loads (call it before `page.goto`): a blocked
 * inline script fires a `securitypolicyviolation` event. Returns a function that reads what was recorded so far.
 */
export async function watchCspViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript((store) => {
    const seen: string[] = [];
    Object.defineProperty(window, store, { value: seen });
    document.addEventListener("securitypolicyviolation", (event) => {
      seen.push(`${event.effectiveDirective} blocked ${event.blockedURI || "inline"}: ${event.sample}`);
    });
  }, STORE);
  return () => page.evaluate((store) => [...(Reflect.get(window, store) as string[])], STORE);
}

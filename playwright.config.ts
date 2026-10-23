import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests (issue: full site test). They run against their own copy of the app on port 3029 with its own build
 * folder, so a dev server on 3028 is never touched. Differences from a normal run, all for testing only:
 *  - the sign-up robot check is off (a CAPTCHA cannot be clicked by a script);
 *  - email goes to a local stand-in for Resend (e2e/mock-resend.mjs), so tests can read the messages and click their links;
 *  - the database is the local D1 file, and every user a test makes is deleted afterwards (e2e/global-teardown.ts).
 * - the test copy of the app has its OWN local database folder (.wrangler/state-e2e), so a normal dev server running at
 *   the same time never shares files with it (sharing them breaks both).
 * Set E2E_BASE_URL to test an already-running site instead (then no server is started and nothing is deleted).
 *
 * The test copy is a BUILT app (`next build`, then `next start`), not `next dev`: a dev server compiles each page the
 * first time it is asked for and renders everything in React's slow development mode, which made the whole run take
 * about 7.5 minutes instead of about 3. The build takes under a minute. E2E_DEV=1 uses `next dev` instead (no build,
 * and code changes show without restarting: handy while writing one spec).
 */
// Both can be moved so a second checkout can run the suite beside another one (E2E_PORT=3031 MOCK_RESEND_PORT=8901).
const PORT = Number(process.env.E2E_PORT ?? 3029);
const MAIL_PORT = Number(process.env.MOCK_RESEND_PORT ?? 8899);
const external = process.env.E2E_BASE_URL;
const BASE = external ?? `http://localhost:${PORT}`;
// Where the test copy keeps its database. Helpers and teardown read the same variable (workers inherit it).
if (!external) process.env.E2E_PERSIST ??= ".wrangler/state-e2e";
// The helpers read the stand-in mailbox from here (workers inherit it).
process.env.E2E_MAIL_URL ??= `http://127.0.0.1:${MAIL_PORT}`;
process.env.E2E_PORT ??= String(PORT);

const DEV_SERVER = Boolean(process.env.E2E_DEV);

const SERIAL_SPECS = /support-notice\.spec\.ts$/;
// The slow "every control does something" sweep is not part of the normal run (npm run e2e:sweep runs it). A project's own
// testIgnore replaces the top-level one, so it is listed here too.
const NORMAL_IGNORE = [SERIAL_SPECS, ...(process.env.SWEEP ? [] : [/every-control/])];
const PHONE_SPECS =
  /(first-day|clients-split|public|phone-dialogs|phone-header-controls|swipe-nav|left-nav|size-audit|persona-fixes|account-tabs|user-menu|team|invoice-actions-height|invoice-pages|week-pills|timesheet-notes|year-summary|work-items-pages|project-chips|project-search|landing-deck|assistant-terminal|global-search|slide-to-delete|page-descriptions)\.spec\.ts$/;

// A CircleCI container is about twice as slow as a laptop (2 workers, a cold app that compiles each page the first time),
// so the waits are doubled there. A real regression still fails; a slow machine does not.
const SLOW = process.env.CIRCLECI ? 2 : 1;

// The serial spec flips a setting with SQL on the local database, so it can never run against a live site (the
// after-deploy smoke test points E2E_BASE_URL at production: running it there failed and rolled the site back).
const SERIAL_FIRST = external ? [] : ["serial"];

export default defineConfig({
  testDir: "./e2e",
  // The "every control does something" sweep is slow (minutes), so the normal run skips it; `npm run e2e:sweep` runs it.
  testIgnore: process.env.SWEEP ? undefined : /every-control/,
  outputDir: "./e2e/report/artifacts",
  reporter: [
    ["list"],
    ["html", { outputFolder: "e2e/report/html", open: "never" }],
    ["json", { outputFile: "e2e/report/results.json" }],
    // CircleCI reads this to learn how long each spec takes, and splits the files evenly across containers by it.
    ...(process.env.CIRCLECI ? ([["junit", { outputFile: "test-results/e2e-junit.xml" }]] as const) : []),
  ],
  // Spec FILES run side by side (the tests inside one file still run in order, and every test makes its own account, so
  // they never share data). Override with E2E_WORKERS. The one spec that flips a global setting runs first, alone
  // (the "serial" project below).
  fullyParallel: false,
  // A slow shared CI machine now and then times a test out that passes alone (issue #197). One retry there; a test that
  // needs it is listed as "flaky" in the report, so it is never hidden. Locally a failure is a failure.
  retries: process.env.CIRCLECI ? 1 : 0,
  workers: Number(process.env.E2E_WORKERS ?? (process.env.CIRCLECI ? 2 : process.env.CI ? 3 : 4)),
  timeout: 180_000,
  expect: { timeout: 15_000 * SLOW },
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: external ? undefined : "./e2e/global-teardown.ts",
  use: { baseURL: BASE, trace: "retain-on-failure", actionTimeout: 20_000 * SLOW, navigationTimeout: 30_000 * SLOW },
  projects: [
    // The spec that switches a setting every account sees (the "chip in" note): it runs first and alone.
    {
      name: "serial",
      testMatch: SERIAL_SPECS,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "desktop",
      dependencies: SERIAL_FIRST,
      testIgnore: NORMAL_IGNORE,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      // A phone runs the specs that look or behave differently on one (layout, touch, the on-screen keyboard); the
      // rest do the same thing on any screen, so running them twice only costs time. E2E_FULL_PHONE=1 (the nightly
      // run) runs every spec on the phone as well.
      name: "phone",
      dependencies: SERIAL_FIRST,
      testMatch: process.env.E2E_FULL_PHONE ? /.*\.spec\.ts$/ : PHONE_SPECS,
      testIgnore: NORMAL_IGNORE,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: external
    ? undefined
    : [
        {
          command: "node e2e/mock-resend.mjs",
          url: `http://127.0.0.1:${MAIL_PORT}/__health`,
          env: { MOCK_RESEND_PORT: String(MAIL_PORT) },
          reuseExistingServer: true,
          timeout: 20_000,
        },
        {
          // E2E_SERVE=1 is set only for `next start` (it gives the built app the local database); never while building.
          command: DEV_SERVER ? `npx next dev -p ${PORT}` : `npx next build && E2E_SERVE=1 npx next start -p ${PORT}`,
          url: BASE,
          reuseExistingServer: true,
          timeout: 480_000,
          env: {
            NEXT_DIST_DIR: DEV_SERVER ? ".next-e2e" : ".next-e2e-build",
            E2E_PERSIST: process.env.E2E_PERSIST ?? "",
            GOOGLE_CALENDAR_CLIENT_ID: "e2e-test.apps.googleusercontent.com", // switches the Google Calendar button on (Google itself is faked)
            GOOGLE_CALENDAR_PUBLIC: "1", // shows it to every test account (in production it is for the owner until Google verifies the app)
            NEXT_PUBLIC_ENABLE_SW: "1", // the offline worker is off in development unless a test asks for it
            AUTH_URL: BASE,
            NEXT_PUBLIC_APP_URL: BASE,
            TURNSTILE_SITE_KEY: "",
            TURNSTILE_SECRET_KEY: "",
            RESEND_API_KEY: "e2e-key",
            RESEND_API_URL: `http://127.0.0.1:${MAIL_PORT}`,
            EMAIL_FROM: "UseHourly <e2e@example.test>",
            RESEND_WEBHOOK_SECRET: "",
          },
        },
      ],
});

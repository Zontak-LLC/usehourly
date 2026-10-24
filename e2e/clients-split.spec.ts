import type { Page } from "@playwright/test";

import { expect, signUpByApi, test } from "./helpers";

// Clients as a split view with a bill bar (issue 238, design 3 variation B): the list groups the clients with time to
// bill first, each with its amount; the chosen client's profile has three calm figures, tabs, and a bill bar pinned to
// its foot with Make invoice while the client has time to bill. Each client has its own address; on a phone the list and
// the profile are two screens.

/** A local YYYY-MM-DD some days before today (the browser and the test run on the same machine). */
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** "Oct 9", with the year when it is not this year (as the page writes it). */
const short = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const sameYear = y === new Date().getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(new Date(y, m - 1, d));
};

async function call<T>(page: Page, path: string, data: unknown): Promise<T> {
  const res = await page.request.post(`/api/trpc/${path}`, { data });
  expect(res.ok(), `${path} answered ${res.status()}`).toBe(true);
  return ((await res.json()) as { result: { data: T } }).result.data;
}

/** Three clients: Fable Labs (5:30 to bill at $95), Northwind Studio (1:00 at $100), Quiet Co (a project, no time). */
async function seed(page: Page) {
  await signUpByApi(page);
  const ids: Record<string, string> = {};
  const plan = [
    {
      name: "Fable Labs",
      project: "Mobile app",
      rate: 9500,
      entries: [
        [14, 180],
        [1, 150],
      ],
    },
    { name: "Northwind Studio", project: "Website", rate: 10_000, entries: [[3, 60]] },
    { name: "Quiet Co", project: "Admin", rate: 5000, entries: [] },
  ] as const;
  for (const c of plan) {
    const client = await call<{ id: string }>(page, "clients.create", { name: c.name });
    ids[c.name] = client.id;
    const project = await call<{ id: string }>(page, "project.create", {
      clientId: client.id,
      name: c.project,
      hourlyRate: c.rate,
    });
    for (const [ago, minutes] of c.entries) {
      await call(page, "entry.create", { projectId: project.id, date: daysAgo(ago), minutes, note: "" });
    }
  }
  return ids;
}

const listGroup = (page: Page, name: "To bill" | "All billed up") =>
  page.getByRole("list", { name: new RegExp(`^${name} · \\d+$`) });

test("the list puts clients to bill first, and the profile's bill bar says how much and since when", async ({
  page,
}) => {
  const ids = await seed(page);
  const phone = (page.viewportSize()?.width ?? 0) < 768;
  await page.goto("/dashboard/clients");
  await expect(page.getByText("3 clients · $622.50 not invoiced yet")).toBeVisible();

  await test.step("To bill first, most money first, each with its amount; then All billed up", async () => {
    const toBill = listGroup(page, "To bill");
    await expect(toBill.getByRole("link")).toHaveCount(2);
    await expect(toBill.getByRole("link").nth(0)).toContainText("Fable Labs");
    await expect(toBill.getByRole("link").nth(0)).toContainText("$522.50");
    await expect(toBill.getByRole("link").nth(1)).toContainText("Northwind Studio");
    await expect(toBill.getByRole("link").nth(1)).toContainText("$100.00");
    const billed = listGroup(page, "All billed up");
    await expect(billed.getByRole("link")).toHaveCount(1);
    await expect(billed.getByRole("link").first()).toContainText("Quiet Co");
    await expect(billed.getByRole("link").first()).toContainText("No time yet");
  });

  if (phone) {
    await test.step("a phone shows the list alone, then the profile as its own screen", async () => {
      await expect(page.getByRole("region", { name: "Fable Labs" })).toBeHidden();
      await listGroup(page, "To bill")
        .getByRole("link", { name: /^Fable Labs/ })
        .click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${ids["Fable Labs"]}$`));
      await expect(listGroup(page, "To bill")).toBeHidden();
    });
  }

  const fable = page.getByRole("region", { name: "Fable Labs" });
  await test.step("the top client's profile: figures, projects and the bill bar", async () => {
    await expect(fable.getByRole("heading", { name: "Fable Labs", level: 2 })).toBeVisible();
    await expect(fable).toContainText("usually $95.00/h");
    const figures = fable.getByTestId("client-figures");
    await expect(figures).toContainText("Not invoiced$522.50");
    await expect(figures).toContainText("All time5:30");
    await expect(fable.getByRole("tab", { name: "Projects · 1" })).toHaveAttribute("aria-selected", "true");
    await expect(fable.getByRole("button", { name: "Edit Mobile app" })).toBeVisible();

    const bar = fable.getByTestId("bill-bar");
    await expect(bar).toContainText("$522.50 not invoiced");
    await expect(bar).toContainText(
      `5:30 h from ${short(daysAgo(14))} to ${short(daysAgo(1))} · oldest day 14 days ago`,
    );
    const make = bar.getByRole("link", { name: "Make an invoice for Fable Labs" });
    await expect(make).toHaveText("Make invoice");
    await expect(make).toHaveAttribute("href", `/dashboard/invoices/new?client=${ids["Fable Labs"]}`);
    await expect(make).toHaveAttribute("data-variant", "primary"); // the page's one solid button
  });

  await test.step("the bill bar stays reachable on every tab", async () => {
    await fable.getByRole("tab", { name: "Time" }).click();
    await expect(fable.getByText("Mobile app").first()).toBeVisible();
    await expect(fable.getByTestId("bill-bar")).toBeVisible();
    await fable.getByRole("tab", { name: "Billing details" }).click();
    await expect(page.getByRole("form", { name: "Billing details for Fable Labs" })).toBeVisible();
    // A form with its own Save is open, so Make invoice steps down to an outline (one solid button per screen).
    await expect(fable.getByRole("link", { name: "Make an invoice for Fable Labs" })).toHaveAttribute(
      "data-variant",
      "outline",
    );
  });

  if (phone) {
    await test.step("on a phone the bill bar sits above the bottom tab bar", async () => {
      await fable.getByRole("tab", { name: "Projects · 1" }).click();
      const bar = await fable.getByTestId("bill-bar").boundingBox();
      const tabs = await page.getByRole("navigation", { name: "Main pages" }).boundingBox();
      expect(bar && tabs && bar.y + bar.height <= tabs.y + 1).toBe(true);
      await page.getByRole("link", { name: "All clients" }).click();
      await expect(page).toHaveURL(/\/dashboard\/clients$/);
      await expect(listGroup(page, "All billed up")).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${ids["Fable Labs"]}$`));
      await expect(fable.getByTestId("bill-bar")).toBeVisible();
      await page.goBack();
    });
  }

  await test.step("a billed-up client has no bill bar; its address opens it directly", async () => {
    await listGroup(page, "All billed up")
      .getByRole("link", { name: /^Quiet Co/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/clients/${ids["Quiet Co"]}$`));
    const quiet = page.getByRole("region", { name: "Quiet Co" });
    await expect(quiet.getByTestId("client-figures")).toContainText("Not invoiced$0.00");
    await expect(quiet.getByTestId("bill-bar")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "Quiet Co" }).getByRole("heading", { level: 2 })).toHaveText(
      "Quiet Co",
    );
  });

  await test.step("Make invoice opens the builder on that client", async () => {
    await page.goto(`/dashboard/clients/${ids["Northwind Studio"]}`);
    const northwind = page.getByRole("region", { name: "Northwind Studio" });
    await expect(northwind.getByTestId("bill-bar")).toContainText("$100.00 not invoiced");
    await expect(northwind.getByTestId("bill-bar")).toContainText(
      `1:00 h on ${short(daysAgo(3))} · oldest day 3 days ago`,
    );
    await northwind.getByRole("link", { name: "Make an invoice for Northwind Studio" }).click();
    await expect(page).toHaveURL(/dashboard\/invoices\/new\?client=/);
    await expect(page.getByLabel("Client")).toHaveValue(ids["Northwind Studio"]);
  });
});

test("a new client opens its own profile, which says how to start", async ({ page }) => {
  await seed(page);
  await page.goto("/dashboard/clients");
  await page.getByRole("button", { name: "New client" }).click();
  await page.getByLabel("New client name").fill("Empty Co");
  await page.getByRole("button", { name: "Add client" }).click();
  await expect(page).toHaveURL(/\/dashboard\/clients\/[\w-]+$/);
  const empty = page.getByRole("region", { name: "Empty Co" });
  await expect(empty).toContainText("No projects yet. Use Add a project to start logging time for Empty Co.");
  await expect(empty.getByTestId("bill-bar")).toHaveCount(0);
  const add = empty.getByRole("button", { name: "Add a project for Empty Co" });
  await add.click();
  await expect(add).toHaveAttribute("aria-expanded", "true");
  await expect(empty.getByText("New project for Empty Co")).toBeVisible();
  await empty.getByRole("button", { name: "Cancel" }).first().click();
  await expect(add).toHaveAttribute("aria-expanded", "false");
});

test("an unknown or archived client's address says so and points to the archive", async ({ page }) => {
  await seed(page);
  await page.goto("/dashboard/clients/not-a-client");
  await expect(page.getByText("This client is not on your list.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Archived clients and projects" })).toBeVisible();
});

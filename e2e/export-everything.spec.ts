import { downloadEverythingZip, expect, invoiceTodayByApi, stamp, startDemo, test } from "./helpers";

/*
 * "Download everything" is a full copy of what a person entered: besides time and the invoice list, the zip holds
 * clients, projects, business details, each invoice's frozen snapshot, and time on days marked non-billable.
 */

test("Download everything holds clients, projects, business details and every invoice's snapshot", async ({ page }) => {
  await startDemo(page);
  const number = `E2E-${stamp()}`;
  await invoiceTodayByApi(page, number);

  await page.goto("/dashboard/account#data");
  const card = page.getByRole("region", { name: "Download everything" });
  await expect(card).toBeVisible();
  const zip = await downloadEverythingZip(page, card);

  const names = Object.keys(zip.files);
  expect(names).toEqual(expect.arrayContaining(["clients.csv", "projects.csv", "business.json", "invoices.csv"]));
  expect(names.filter((n) => /^invoices\/.+\.json$/.test(n)).length).toBeGreaterThan(0);

  const invoice = JSON.parse((await zip.file(`invoices/${number}.json`)?.async("string")) ?? "{}") as {
    number?: string;
    snapshot?: { lines?: { minutes: number }[] };
  };
  expect(invoice.number).toBe(number);
  expect(Array.isArray(invoice.snapshot?.lines)).toBe(true);
  // the demo may hold more unbilled time today on that project, so at least the hour logged above
  expect(invoice.snapshot?.lines?.[0]?.minutes).toBeGreaterThanOrEqual(60);

  const csv = (await zip.file("all-entries.csv")?.async("string")) ?? "";
  const header = csv.replace(String.fromCharCode(0xfeff), "").split("\r\n")[0];
  expect(header).toBe("Date,Client,Project,Note,Hours,Minutes,Billable,Rate (per hour),Amount,Currency,Billable day");

  const business = JSON.parse((await zip.file("business.json")?.async("string")) ?? "{}") as { email?: string };
  expect(business.email).toMatch(/@/);
});

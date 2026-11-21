import { describe, expect, it } from "vitest";

import { feature } from "@/lib/features";

import { createCaller, input, setup, VAT } from "./helpers/invoice-tax-world";

/**
 * Invoice tax is hidden in this release (real switches, no mock). Nobody can save tax settings by calling the server
 * directly, and an invoice that asks for tax is made without it. Invoices without tax work as before, and a tax number
 * the account already holds still prints: it is the seller's own number, which a VAT-registered seller must show.
 */

describe("while invoice tax is hidden", () => {
  it("runs with the release's real switch", () => {
    expect(feature("invoiceTax")).toBe(false);
  });

  it("refuses to save tax settings, as not found, and touches nothing", async () => {
    const { prisma, caller } = setup();
    await expect(caller.account.setTax({ name: "VAT", rate: 2000, number: "GB123456789" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Not found.",
    });
    expect(prisma.authUser.update).not.toHaveBeenCalled();
    expect(prisma.authUser.findUnique).not.toHaveBeenCalled();
  });

  it("still asks a signed-out caller to sign in first", async () => {
    const { prisma } = setup();
    const signedOut = createCaller({ session: null, prisma: prisma as never });
    await expect(signedOut.account.setTax({ name: "VAT", rate: 2000, number: "" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(prisma.authUser.update).not.toHaveBeenCalled();
  });

  it("makes the invoice without tax when a caller asks for it", async () => {
    const { prisma, caller } = setup(VAT);
    const made = await caller.invoice.create({ ...input, addTax: true });
    expect(made.snapshot.tax).toBeUndefined();
    expect(made.snapshot.subtotalCents).toBeUndefined();
    expect(made.snapshot.totalCents).toBe(15000);
    const data = prisma.invoice.create.mock.calls[0][0].data;
    expect(data.total_cents).toBe(15000);
    expect(JSON.parse(data.snapshot).tax).toBeUndefined();
  });

  it("previews the invoice without tax when a caller asks for it", async () => {
    const { caller } = setup(VAT);
    const { snapshot } = await caller.invoice.preview({ ...input, addTax: true });
    expect(snapshot.tax).toBeUndefined();
    expect(snapshot.subtotalCents).toBeUndefined();
    expect(snapshot.totalCents).toBe(15000);
  });

  it("still makes an invoice that does not ask for tax", async () => {
    const { caller } = setup();
    const made = await caller.invoice.create(input);
    expect(made.id).toBe("inv1");
    expect(made.snapshot.tax).toBeUndefined();
    expect(made.snapshot.totalCents).toBe(15000);
  });

  it("still prints the tax number the account already holds", async () => {
    const { caller } = setup(VAT);
    const made = await caller.invoice.create(input);
    expect(made.snapshot.seller.taxNumber?.value).toBe("GB123456789");
  });
});

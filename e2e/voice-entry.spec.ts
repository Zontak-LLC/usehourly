import type { Page } from "@playwright/test";

import { VOICE_BLOCKED, VOICE_LISTENING } from "../src/lib/voice-entry";
import { expect, startFreshAccount, test, trpc } from "./helpers";

/**
 * Say it (issue 429): the mic in the Log time card fills the time, the project and the description from one spoken
 * sentence, and nothing is saved until Log time is tapped. The browser's speech recognition is replaced by a stand-in
 * (no microphone, no network) before the page loads: it shows the first words while it "listens", and gives the whole
 * sentence as a final result when the test calls `finishSpeech`. `error` makes it fail with that code instead.
 */
async function fakeSpeech(page: Page, speech: { say?: string; error?: string }) {
  await page.addInitScript(({ say = "", error }) => {
    type Result = { isFinal: boolean; 0: { transcript: string } };
    type Listener<T> = ((event: T) => void) | null;
    const w = window as Window & { SpeechRecognition?: unknown; finishSpeech?: () => void };
    class FakeRecognition {
      lang = "";
      interimResults = false;
      continuous = true;
      maxAlternatives = 0;
      onresult: Listener<{ results: Result[] }> = null;
      onerror: Listener<{ error: string }> = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          if (error) {
            this.onerror?.({ error });
            this.onend?.();
            return;
          }
          const firstWords = say.split(" ").slice(0, 2).join(" ");
          this.onresult?.({ results: [{ isFinal: false, 0: { transcript: firstWords } }] });
        }, 50);
        w.finishSpeech = () => {
          this.onresult?.({ results: [{ isFinal: true, 0: { transcript: say } }] });
          this.onend?.();
        };
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    w.SpeechRecognition = FakeRecognition;
  }, speech);
}

/** A fresh account working for Acme (project General) and Northwind Bakery (project Checkout), standing on Today. */
async function twoClients(page: Page) {
  await startFreshAccount(page, "Acme");
  const northwind = await trpc<{ id: string }>(page, "clients.create", { name: "Northwind Bakery" });
  await trpc(page, "project.create", { clientId: northwind.id, name: "Checkout", hourlyRate: 0 });
  await page.reload();
  const card = page.getByRole("region", { name: /^Log time/ });
  await expect(card.getByRole("radio", { name: "Checkout" })).toBeVisible();
  return card;
}

const todaysEntries = (page: Page) => page.getByRole("region", { name: "Today's entries" });

test("say a sentence: the time, the project and the description fill, and Log time saves it", async ({ page }) => {
  const said = "two hours on Northwind, fixing the checkout page";
  await fakeSpeech(page, { say: said });
  const card = await twoClients(page);
  await card.getByRole("radio", { name: "General" }).click();
  const mic = card.getByRole("button", { name: "Say it" });

  await test.step("the mic is a target of at least 44 × 44 px", async () => {
    const box = await mic.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  await test.step("while it listens: the mic is pressed, the line says so, and the words show greyed", async () => {
    await mic.click();
    await expect(mic).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByText(VOICE_LISTENING)).toBeVisible();
    await expect(card.getByLabel("Description")).toHaveAttribute("placeholder", "two hours");
    await expect(card.getByLabel("Description")).toHaveValue("");
  });

  await test.step("the sentence fills the same fields typing does", async () => {
    await page.evaluate(() => (window as Window & { finishSpeech?: () => void }).finishSpeech?.());
    await expect(mic).toHaveAttribute("aria-pressed", "false");
    await expect(card.getByLabel("Time to add")).toHaveValue("2h");
    await expect(card.getByRole("radio", { name: "Checkout" })).toBeChecked();
    await expect(card.getByLabel("Description")).toHaveValue("Fixing the checkout page");
    await expect(card.getByText(`Heard: “${said}”`)).toBeVisible();
    await expect(card.getByRole("button", { name: "Clear" })).toBeVisible();
    await expect(todaysEntries(page)).toHaveCount(0); // nothing is saved before Log time
  });

  await test.step("Log time saves it to Today's entries with those values", async () => {
    await card.getByRole("button", { name: /^Log time/ }).click();
    const row = todaysEntries(page).getByRole("listitem").filter({ hasText: "Fixing the checkout page" });
    await expect(row).toContainText("2:00");
    await expect(row).toContainText("Checkout");
    await expect(card.getByText(/^Heard:/)).toHaveCount(0);
  });
});

test("an unknown client shows the closest clients and + Add; picking one saves under that client", async ({ page }) => {
  await fakeSpeech(page, { say: "two hours on Zephyr, design" });
  const card = await twoClients(page);
  await card.getByRole("button", { name: "Say it" }).click();
  await page.evaluate(() => (window as Window & { finishSpeech?: () => void }).finishSpeech?.());

  const log = card.getByRole("button", { name: /^Log time/ });
  await expect(card.getByText("“Zephyr” isn't one of your clients")).toBeVisible();
  await expect(card.getByRole("button", { name: "Acme", exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Northwind Bakery", exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Add Zephyr" })).toBeVisible();
  await expect(card.getByRole("radio")).toHaveCount(0); // the chips stand in for the project pills
  await expect(log).toBeDisabled();

  await test.step("+ Add Zephyr opens the Add a client form with the name filled in", async () => {
    await card.getByRole("button", { name: "Add Zephyr" }).click();
    await expect(card.getByLabel("Client name")).toHaveValue("Zephyr");
    await expect(card.getByLabel("Project name")).toBeFocused();
  });

  await test.step("a client chip picks that client's project and wakes Log time", async () => {
    await card.getByRole("button", { name: "Northwind Bakery", exact: true }).click();
    await expect(card.getByText("“Zephyr” isn't one of your clients")).toHaveCount(0);
    await expect(card.getByLabel("Client name")).toHaveCount(0);
    await expect(card.getByRole("radio", { name: "Checkout" })).toBeChecked();
    await expect(log).toBeEnabled();
    await log.click();
    const row = todaysEntries(page).getByRole("listitem").filter({ hasText: "Design" });
    await expect(row).toContainText("2:00");
    await expect(row).toContainText("Checkout");
  });
});

test("a blocked microphone says so in plain words, and nothing is saved", async ({ page }) => {
  await fakeSpeech(page, { error: "not-allowed" });
  const card = await twoClients(page);
  await card.getByRole("button", { name: "Say it" }).click();
  await expect(card.getByRole("alert")).toHaveText(VOICE_BLOCKED);
  await expect(card.getByRole("button", { name: "Say it" })).toHaveAttribute("aria-pressed", "false");
  await expect(card.getByRole("button", { name: /^Log time/ })).toBeDisabled();
  await expect(todaysEntries(page)).toHaveCount(0);
});

test("without speech recognition there is no mic, and typing still logs time", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  });
  await startFreshAccount(page, "Acme");
  const card = page.getByRole("region", { name: /^Log time/ });
  await expect(card.getByLabel("Time to add")).toBeVisible();
  await expect(page.getByRole("button", { name: "Say it" })).toHaveCount(0);
  await card.getByLabel("Time to add").fill("1:30");
  await card.getByLabel("Description").fill("typed, no mic");
  await card.getByRole("button", { name: /^Log time/ }).click();
  const row = todaysEntries(page).getByRole("listitem").filter({ hasText: "typed, no mic" });
  await expect(row).toContainText("1:30");
});

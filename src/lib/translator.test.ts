import { expect, test, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  clearTranslations,
  pageGenerated,
  pageTokensPerSecond,
  requestTranslation,
  resetPageSpeed,
  selectionSpeed,
} from "./translator";

const et = { code: "et", name: "Estonian" };
const en = { code: "en", name: "English" };

/** The background script's answers, as ollama.ts shapes them from Ollama's eval_count / eval_duration. */
function background(reply: { text: string; tokens?: number; seconds?: number }) {
  const calls: { type: string; purpose?: string }[] = [];
  vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation((async (message: {
    type: string;
    purpose?: string;
  }) => {
    calls.push(message);
    return message.type === "model-loaded" ? { loaded: true } : reply;
  }) as never);
  return calls;
}

test("a selection translation remembers the speed the server reported", async () => {
  fakeBrowser.reset();
  clearTranslations();
  const calls = background({ text: "Hello", tokens: 40, seconds: 2 });
  expect(await requestTranslation(et, en, "Tere", "selection")).toBe("Hello");
  expect(selectionSpeed(et, en, "Tere")).toBe(20);
  expect(calls.find((c) => c.type === "translate-text")?.purpose).toBe("selection");
  expect(pageTokensPerSecond()).toBeUndefined(); // selections don't count towards the page average
});

test("page translations add up to one running average, reset per page", async () => {
  fakeBrowser.reset();
  clearTranslations();
  resetPageSpeed();
  background({ text: "x", tokens: 30, seconds: 1 });
  await requestTranslation(et, en, "üks");
  background({ text: "y", tokens: 10, seconds: 1 });
  await requestTranslation(et, en, "kaks");
  expect(pageTokensPerSecond()).toBe(20); // 40 tokens in 2 s, not the mean of 30 and 10
  resetPageSpeed();
  expect(pageTokensPerSecond()).toBeUndefined();
});

test("no speed when the server doesn't report one", async () => {
  fakeBrowser.reset();
  clearTranslations();
  background({ text: "Hello" });
  await requestTranslation(et, en, "Tere", "selection");
  expect(selectionSpeed(et, en, "Tere")).toBeUndefined();
});

test("a saved translation is marked cached instead of showing a speed", async () => {
  fakeBrowser.reset();
  clearTranslations();
  const calls = background({ text: "Hello", tokens: 40, seconds: 2 });
  await requestTranslation(et, en, "Tere", "selection");
  await vi.waitFor(async () => {
    const saved = await fakeBrowser.storage.local.get(null);
    expect(Object.keys(saved).some((key) => key.startsWith("tr:"))).toBe(true);
  });
  clearTranslations(); // forget the in-page copy; the saved cache remains
  calls.length = 0;
  expect(await requestTranslation(et, en, "Tere", "selection")).toBe("Hello");
  expect(selectionSpeed(et, en, "Tere")).toBe("cached");
  expect(calls.some((c) => c.type === "translate-text")).toBe(false);
});

test("a page translated only from saved translations reports nothing generated, so it can say cached", async () => {
  fakeBrowser.reset();
  clearTranslations();
  resetPageSpeed();
  const calls = background({ text: "Hello", tokens: 40, seconds: 2 });
  await requestTranslation(et, en, "Tere");
  expect(pageGenerated()).toBe(true);
  await vi.waitFor(async () => {
    const saved = await fakeBrowser.storage.local.get(null);
    expect(Object.keys(saved).some((key) => key.startsWith("tr:"))).toBe(true);
  });
  // Translating the same page again: the in-page copy and the saved cache answer, no request is sent.
  resetPageSpeed();
  calls.length = 0;
  expect(await requestTranslation(et, en, "Tere")).toBe("Hello");
  clearTranslations();
  expect(await requestTranslation(et, en, "Tere")).toBe("Hello");
  expect(calls.some((c) => c.type === "translate-text")).toBe(false);
  expect(pageGenerated()).toBe(false);
  expect(pageTokensPerSecond()).toBeUndefined();
});

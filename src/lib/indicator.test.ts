import { expect, test } from "vitest";
import { indicatorText } from "./indicator";
import { LOADING_MODEL } from "./messages";

const base = { done: 0, pending: 0, target: "et" };

test("shows progress and speed while translating, then the result, and nothing when idle", () => {
  expect(indicatorText({ ...base, state: "idle" })).toBeUndefined();
  expect(indicatorText({ ...base, state: "translating" })).toEqual({ text: "Translating…" });
  expect(
    indicatorText({ ...base, state: "translating", done: 3, pending: 5, tokensPerSecond: 21.26 }),
  ).toEqual({ text: "Translating… 5 left · 21.3 tok/s" });
  expect(indicatorText({ ...base, state: "translated", done: 8, tokensPerSecond: 20 })).toEqual({
    text: "Translated 8 blocks · 20.0 tok/s",
    done: true,
  });
});

test("says cached when nothing was generated, rather than showing no speed", () => {
  expect(indicatorText({ ...base, state: "translated", done: 8, fromCache: true })).toEqual({
    text: "Translated 8 blocks · cached",
    done: true,
  });
  // A server that reports no speed: no label at all.
  expect(indicatorText({ ...base, state: "translated", done: 8 })?.text).toBe(
    "Translated 8 blocks",
  );
});

test("loading the model and errors", () => {
  expect(indicatorText({ ...base, state: "translating", loadingModel: true })?.text).toBe(
    LOADING_MODEL,
  );
  expect(
    indicatorText({ ...base, state: "translating", error: "Ollama is not reachable" }),
  ).toEqual({ text: "Translation stopped: Ollama is not reachable", error: true, done: true });
});

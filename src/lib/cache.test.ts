import { expect, test, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { evict, getStored, oldestHalf, putStored } from "./cache";
import type { Language } from "./languages";
import { cacheLimitPref, modelPref } from "./prefs";

test("evicts the older half of translations only", () => {
  const items = {
    target: "th",
    "tr:c": { text: "c", at: 3 },
    "tr:a": { text: "a", at: 1 },
    "tr:d": { text: "d", at: 4 },
    "tr:b": { text: "b", at: 2 },
    "tr:e": { text: "e", at: 5 },
  };
  expect(oldestHalf(items)).toEqual(["tr:a", "tr:b", "tr:c"]);
});

test("evicts until translations fit the limit, all of them at 0", async () => {
  fakeBrowser.reset();
  const local = fakeBrowser.storage.local;
  vi.spyOn(local, "getBytesInUse").mockImplementation(async (keys) => {
    const items = await local.get(keys);
    return Object.values(items).reduce<number>((sum, v) => sum + JSON.stringify(v).length, 0);
  });
  const entries = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [`tr:${i}`, { text: "x".repeat(100), at: i }]),
  );
  await local.set({ ...entries, target: "th" });

  await cacheLimitPref.setValue(300 / 1024 / 1024);
  await evict();
  expect(Object.keys(await local.get(null)).sort()).toEqual([
    "cacheLimit",
    "target",
    "tr:6",
    "tr:7",
  ]);

  await cacheLimitPref.setValue(0);
  await evict();
  expect(Object.keys(await local.get(null)).sort()).toEqual(["cacheLimit", "target"]);
});

test("keeps saved translations when only the device changes", async () => {
  fakeBrowser.reset();
  const en = { code: "en", name: "English" } as Language;
  const th = { code: "th", name: "Thai" } as Language;
  await modelPref.setValue("eurollm-1.7b-it@NPU");
  await putStored(en, th, "hello", "สวัสดี");
  await modelPref.setValue("eurollm-1.7b-it@GPU");
  expect(await getStored(en, th, "hello")).toBe("สวัสดี");
  await modelPref.setValue("other-model");
  expect(await getStored(en, th, "hello")).toBeUndefined();
});

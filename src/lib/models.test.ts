import { expect, test } from "vitest";
import { groupModels, joinModel, splitModel } from "./models";

test("splits a device suffix only when it names a device", () => {
  expect(splitModel("eurollm-1.7b-it@GPU")).toEqual({ model: "eurollm-1.7b-it", device: "GPU" });
  expect(splitModel("translategemma:4b@npu")).toEqual({
    model: "translategemma:4b",
    device: "NPU",
  });
  expect(splitModel("translategemma:4b")).toEqual({ model: "translategemma:4b", device: "" });
  expect(splitModel("user@host-model")).toEqual({ model: "user@host-model", device: "" });
});

test("joins back to the name the server expects", () => {
  expect(joinModel({ model: "nllb-200-600m", device: "NPU" })).toBe("nllb-200-600m@NPU");
  expect(joinModel({ model: "nllb-200-600m", device: "" })).toBe("nllb-200-600m");
});

test("groups device variants under their model, plain Ollama lists none", () => {
  expect(
    groupModels(["eurollm-1.7b-it", "eurollm-1.7b-it@NPU", "eurollm-1.7b-it@GPU", "gemma3:4b"]),
  ).toEqual(
    new Map([
      ["eurollm-1.7b-it", ["NPU", "GPU"]],
      ["gemma3:4b", []],
    ]),
  );
});

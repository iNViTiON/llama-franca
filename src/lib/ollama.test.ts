import { expect, test } from "vitest";
import { buildPrompt, generationSpeed } from "./ollama";
import { DEFAULT_PROMPT } from "./prefs";

test("fills placeholders once, leaving ones inside the text", () => {
  const prompt = buildPrompt(
    DEFAULT_PROMPT,
    { code: "en", name: "English" },
    { code: "th", name: "Thai" },
    "Hi {target} {unknown}",
  );
  expect(prompt)
    .toBe(`You are a professional English (en) to Thai (th) translator. Your goal is to accurately convey the meaning and nuances of the original English text while adhering to Thai grammar, vocabulary, and cultural sensitivities.
Produce only the Thai translation, without any additional explanations or commentary. Please translate the following English text into Thai:


Hi {target} {unknown}`);
});

test("reads Ollama's speed fields, and gives none when they are missing or zero", () => {
  expect(generationSpeed({ eval_count: 40, eval_duration: 2_000_000_000 })).toEqual({
    tokens: 40,
    seconds: 2,
  });
  expect(generationSpeed({})).toEqual({});
  expect(generationSpeed({ eval_count: 40, eval_duration: 0 })).toEqual({});
  expect(generationSpeed({ eval_count: 0, eval_duration: 5 })).toEqual({});
});

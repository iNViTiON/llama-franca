import { cacheKey, getStored, putStored } from "./cache";
import type { Language } from "./languages";
import type { Purpose } from "./prefs";
import type {
  ModelMessage,
  ModelResult,
  Reply,
  TranslateTextMessage,
  TranslateTextResult,
} from "./messages";

const translations = new Map<string, Promise<string>>();
/** Per purpose: page and selection translations may use different models (fork). */
const modelReady = new Map<Purpose, Promise<void>>();
let loadingModel = false;
let onLoadingModel: (() => void) | undefined;

export const isLoadingModel = () => loadingModel;

/** Call `listener` when the model starts or stops loading, until unwatched or another listener takes over. */
export function watchLoadingModel(listener: () => void) {
  onLoadingModel = listener;
  return () => {
    if (onLoadingModel === listener) onLoadingModel = undefined;
  };
}

/** Translations from another model or prompt are stale. */
export const clearTranslations = () => {
  translations.clear();
  selectionSpeeds.clear();
};

/** Generation speed the server reported: per selection translation, and a running total for the page. */
const selectionSpeeds = new Map<string, number | "cached">();
const pageSpeed = { tokens: 0, seconds: 0, requests: 0 };

export const resetPageSpeed = () => {
  pageSpeed.tokens = pageSpeed.seconds = pageSpeed.requests = 0;
};
export const pageTokensPerSecond = () =>
  pageSpeed.seconds ? pageSpeed.tokens / pageSpeed.seconds : undefined;
/** False while every page block so far came from saved or in-page translations: nothing generated, no speed. */
export const pageGenerated = () => pageSpeed.requests > 0;
/** Tokens per second, "cached" when the saved cache answered, undefined when the server doesn't report speed. */
export const selectionSpeed = (source: Language, target: Language, text: string) =>
  selectionSpeeds.get(memoKey("selection", source, target, text));

function recordSpeed(purpose: Purpose, key: string, res: TranslateTextResult) {
  if (!res.tokens || !res.seconds) return;
  if (purpose === "selection") selectionSpeeds.set(key, res.tokens / res.seconds);
  else {
    pageSpeed.tokens += res.tokens;
    pageSpeed.seconds += res.seconds;
  }
}

async function ask<T extends object>(message: TranslateTextMessage | ModelMessage): Promise<T> {
  const res: Reply<T> = await browser.runtime.sendMessage(message);
  if ("error" in res) throw new Error(String(res.error));
  return res;
}

function ensureModel(purpose: Purpose) {
  let ready = modelReady.get(purpose);
  if (!ready) {
    ready = (async () => {
      if ((await ask<ModelResult>({ type: "model-loaded", purpose })).loaded) return;
      setLoadingModel(true);
      try {
        await ask<ModelResult>({ type: "load-model", purpose });
      } finally {
        setLoadingModel(false);
      }
    })().finally(() => modelReady.delete(purpose));
    modelReady.set(purpose, ready);
  }
  return ready;
}

function setLoadingModel(on: boolean) {
  loadingModel = on;
  onLoadingModel?.();
}

async function sendTranslation(source: Language, target: Language, text: string, purpose: Purpose) {
  if (purpose === "page") pageSpeed.requests++;
  await ensureModel(purpose);
  const res = await ask<TranslateTextResult>({
    type: "translate-text",
    source,
    target,
    text,
    purpose,
  });
  recordSpeed(purpose, memoKey(purpose, source, target, text), res);
  return res.text;
}

const memoKey = (purpose: Purpose, source: Language, target: Language, text: string) =>
  `${purpose}\n${cacheKey(source, target, text)}`;

export function requestTranslation(
  source: Language,
  target: Language,
  text: string,
  purpose: Purpose = "page",
) {
  const key = memoKey(purpose, source, target, text);
  let result = translations.get(key);
  if (!result) {
    result = getStored(source, target, text, purpose).then(async (stored) => {
      if (stored !== undefined) {
        if (purpose === "selection") selectionSpeeds.set(key, "cached");
        return stored;
      }
      const translation = await sendTranslation(source, target, text, purpose);
      void putStored(source, target, text, translation, purpose);
      return translation;
    });
    result.catch(() => translations.delete(key));
    translations.set(key, result);
  }
  return result;
}

/**
 * Translate uncached lines in one request and seed the cache; on a line-count mismatch each falls back to its own request.
 * Page translation only.
 */
export async function prefetchLines(source: Language, target: Language, texts: string[]) {
  const unseen = [
    ...new Set(texts.filter((text) => !translations.has(memoKey("page", source, target, text)))),
  ];
  const stored = await Promise.all(unseen.map((text) => getStored(source, target, text)));
  const missing = unseen.filter((text, i) => {
    const hit = stored[i];
    if (hit !== undefined)
      translations.set(memoKey("page", source, target, text), Promise.resolve(hit));
    return hit === undefined;
  });
  if (missing.length < 2) return;
  const lines = (await sendTranslation(source, target, missing.join("\n"), "page"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== missing.length) return;
  missing.forEach((text, i) => {
    translations.set(memoKey("page", source, target, text), Promise.resolve(lines[i]!));
    void putStored(source, target, text, lines[i]!);
  });
}

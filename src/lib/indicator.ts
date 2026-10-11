import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { ShadowRootContentScriptUi } from "wxt/utils/content-script-ui/shadow-root";
import { LOADING_MODEL, type PageStatus } from "./messages";

/**
 * Fork: page translation progress and generation speed in the corner of the page, so they show without opening the
 * popup (e.g. after the keyboard shortcut). It never takes clicks, and fades out a few seconds after the visible
 * blocks are done.
 */
const DONE_MS = 4000;
const ERROR_MS = 10_000;

export function indicatorText(status: PageStatus) {
  if (status.state === "idle") return;
  if (status.error)
    return { text: `Translation stopped: ${status.error}`, error: true, done: true };
  if (status.loadingModel) return { text: LOADING_MODEL };
  const speed = status.tokensPerSecond
    ? ` · ${status.tokensPerSecond.toFixed(1)} tok/s`
    : status.fromCache
      ? " · cached"
      : "";
  if (status.state === "translating")
    return { text: `Translating…${status.pending ? ` ${status.pending} left` : ""}${speed}` };
  return { text: `Translated ${status.done} blocks${speed}`, done: true };
}

let ui: Promise<ShadowRootContentScriptUi<HTMLDivElement>> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function updateIndicator(ctx: ContentScriptContext, status: PageStatus) {
  clearTimeout(hideTimer);
  const line = indicatorText(status);
  if (!line) return hideIndicator();
  ui ??= create(ctx);
  void ui.then(({ mounted }) => {
    if (!mounted) return;
    mounted.textContent = line.text;
    mounted.dataset.error = String(!!line.error);
  });
  if (line.done) hideTimer = setTimeout(hideIndicator, line.error ? ERROR_MS : DONE_MS);
}

export function hideIndicator() {
  clearTimeout(hideTimer);
  const shown = ui;
  ui = undefined;
  void shown?.then((it) => it.remove());
}

const STYLE = `
  .chip {
    font: 12px/1.4 system-ui, sans-serif; font-variant-numeric: tabular-nums;
    padding: 6px 10px; border-radius: 8px; max-width: 360px;
    color: #374151; background: #fff; border: 1px solid #d1d5db; box-shadow: 0 4px 16px #0000001f;
  }
  .chip[data-error="true"] { color: #dc2626; }
  @media (prefers-color-scheme: dark) {
    .chip { color: #e5e7eb; background: #1f2937; border-color: #374151; }
    .chip[data-error="true"] { color: #f87171; }
  }`;

async function create(ctx: ContentScriptContext) {
  const it = await createShadowRootUi(ctx, {
    name: "llama-franca-progress",
    position: "inline",
    anchor: "body",
    onMount: (container, shadow) => {
      const style = document.createElement("style");
      style.textContent = STYLE;
      shadow.append(style);
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.setAttribute("role", "status");
      container.append(chip);
      return chip;
    },
  });
  it.mount();
  // As for the selection box: WXT's `:host { all: initial !important }` reset beats styles on the host.
  Object.assign(it.uiContainer.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    pointerEvents: "none",
  });
  return it;
}

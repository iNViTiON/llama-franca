import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { ShadowRootContentScriptUi } from "wxt/utils/content-script-ui/shadow-root";
import { LOADING_MODEL, type PageStatus } from "./messages";

/**
 * Fork: page translation progress and generation speed in the corner of the page, so they show without opening the
 * popup (e.g. after the keyboard shortcut), plus a switch between translating what scrolls into view and the whole
 * page. It stays until the original is shown again. Only the switch takes clicks; the rest of the chip lets them
 * through to the page.
 */
export function indicatorText(status: PageStatus) {
  if (status.state === "idle") return;
  if (status.error) return { text: `Translation stopped: ${status.error}`, error: true };
  if (status.loadingModel) return { text: LOADING_MODEL };
  const speed = status.tokensPerSecond
    ? ` · ${status.tokensPerSecond.toFixed(1)} tok/s`
    : status.fromCache
      ? " · cached"
      : "";
  if (status.state === "translating")
    return { text: `Translating…${status.pending ? ` ${status.pending} left` : ""}${speed}` };
  return { text: `Translated ${status.done} blocks${speed}` };
}

interface Parts {
  chip: HTMLElement;
  text: HTMLElement;
  toggle: HTMLButtonElement;
}

let ui: Promise<ShadowRootContentScriptUi<Parts>> | undefined;
/** What the switch calls; set on every update so the listener, attached once, always reaches the current page. */
let onToggle: (() => void) | undefined;

export function updateIndicator(
  ctx: ContentScriptContext,
  status: PageStatus,
  toggleWholePage: () => void,
) {
  const line = indicatorText(status);
  if (!line) return hideIndicator();
  onToggle = toggleWholePage;
  ui ??= create(ctx);
  void ui.then(({ mounted }) => {
    if (!mounted) return;
    mounted.text.textContent = line.text;
    mounted.chip.dataset.error = String(!!line.error);
    // After an error nothing is queued any more, so the switch would do nothing.
    mounted.toggle.hidden = !!line.error;
    mounted.toggle.setAttribute("aria-checked", String(!!status.wholePage));
  });
}

export function hideIndicator() {
  const shown = ui;
  ui = undefined;
  onToggle = undefined;
  void shown?.then((it) => it.remove());
}

const STYLE = `
  .chip {
    display: flex; align-items: center; gap: 10px; max-width: 420px;
    font: 12px/1.4 system-ui, sans-serif; font-variant-numeric: tabular-nums;
    padding: 6px 10px; border-radius: 8px;
    color: #374151; background: #fff; border: 1px solid #d1d5db; box-shadow: 0 4px 16px #0000001f;
  }
  .chip[data-error="true"] { color: #dc2626; }
  .text { min-width: 0; }
  .toggle {
    all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; flex: none;
    cursor: pointer; pointer-events: auto; white-space: nowrap; border-radius: 6px; padding: 1px 2px;
  }
  .toggle[hidden] { display: none; }
  .toggle:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
  .track { position: relative; width: 26px; height: 14px; border-radius: 7px; background: #9ca3af; transition: background 0.15s; }
  .track::after {
    content: ""; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%;
    background: #fff; transition: transform 0.15s;
  }
  .toggle[aria-checked="true"] .track { background: #2563eb; }
  .toggle[aria-checked="true"] .track::after { transform: translateX(12px); }
  @media (prefers-reduced-motion: reduce) { .track, .track::after { transition: none; } }
  @media (prefers-color-scheme: dark) {
    .chip { color: #e5e7eb; background: #1f2937; border-color: #374151; }
    .chip[data-error="true"] { color: #f87171; }
    .track { background: #6b7280; }
    .toggle[aria-checked="true"] .track { background: #3b82f6; }
  }`;

async function create(ctx: ContentScriptContext) {
  const it = await createShadowRootUi(ctx, {
    name: "llama-franca-progress",
    position: "inline",
    anchor: "body",
    onMount: (container, shadow): Parts => {
      const style = document.createElement("style");
      style.textContent = STYLE;
      shadow.append(style);
      const chip = document.createElement("div");
      chip.className = "chip";
      // Announce the text only: the switch is not a status.
      const text = document.createElement("span");
      text.className = "text";
      text.setAttribute("role", "status");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "toggle";
      toggle.setAttribute("role", "switch");
      toggle.title = "Translate the whole page now, not only what you scroll to";
      const track = document.createElement("span");
      track.className = "track";
      toggle.append(track, "Whole page");
      // The composed click would otherwise reach the page's own "click outside" handlers.
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        onToggle?.();
      });
      chip.append(text, toggle);
      container.append(chip);
      return { chip, text, toggle };
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

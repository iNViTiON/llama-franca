import { ensureContentScript } from "@/lib/content-script";
import type {
  BadgeMessage,
  ListModelsMessage,
  ListModelsResult,
  ModelMessage,
  ModelResult,
  PageMessage,
  Reply,
  TabMode,
  TabModeMessage,
  TranslateTextMessage,
  TranslateTextResult,
} from "@/lib/messages";
import { isModelLoaded, listModels, loadModel, translate } from "@/lib/ollama";
import { displayName, findLanguage, languagesPref } from "@/lib/languages";
import { getTarget, sourcePref, targetPref } from "@/lib/prefs";

const modeKey = (tabId: number) => `tab-mode:${tabId}`;

async function getMode(tabId: number) {
  const key = modeKey(tabId);
  return ((await browser.storage.session.get(key))[key] as TabMode | undefined) ?? null;
}

const languageName = async (code: string) => {
  const language = await findLanguage(code);
  return language ? displayName(language) : code;
};

/** Menu titles are shared by all tabs, so this follows the one in front. */
async function syncMenu() {
  const [[tab], source, target] = await Promise.all([
    browser.tabs.query({ active: true, lastFocusedWindow: true }),
    sourcePref.getValue(),
    getTarget(),
  ]);
  const translating = tab?.id !== undefined && !!(await getMode(tab.id));
  const languages = `${source === "auto" ? "" : `from ${await languageName(source)} `}to ${await languageName(target)}`;
  await Promise.all([
    browser.contextMenus.update("translate-page", {
      title: translating ? "Show original" : `Translate page ${languages}`,
    }),
    browser.contextMenus.update("translate-selection", { title: `Translate "%s" ${languages}` }),
  ]).catch(() => {});
}

type Action = "translate-page" | "translate-selection";

/** Context menu items and keyboard shortcuts share the same two actions. Translating a translated page restores it. */
async function invoke(action: Action, tab: Browser.tabs.Tab | undefined, selectionText = "") {
  if (tab?.id === undefined) return;
  const tabId = tab.id;
  if (action === "translate-page" && (await getMode(tabId))) {
    const restore: PageMessage = { type: "restore-page" };
    // Without a content script (the extension was reloaded) only the stale mode is left to clear.
    await browser.tabs
      .sendMessage(tabId, restore)
      .catch(() => browser.storage.session.remove(modeKey(tabId)));
    return;
  }
  const [source, target] = await Promise.all([sourcePref.getValue(), getTarget()]);
  // The content script reads the page's own selection when a shortcut gives no text.
  const message: PageMessage =
    action === "translate-page"
      ? { type: "translate-page", source, target }
      : { type: "translate-selection", text: selectionText, source, target };
  // Fails on pages extensions can't script, like browser pages.
  ensureContentScript(tabId)
    .then(() => browser.tabs.sendMessage(tabId, message))
    .catch(() => {});
}

/** Returns true to keep the message channel open until it answers. */
function reply<T>(result: Promise<T>, sendResponse: (response: Reply<T>) => void) {
  result.then(sendResponse, (error: Error) => sendResponse({ error: error.message }));
  return true;
}

// Ollama is called from here, not the content script, so requests carry the extension origin allowed by OLLAMA_ORIGINS.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (
      message:
        | TranslateTextMessage
        | BadgeMessage
        | TabModeMessage
        | ModelMessage
        | ListModelsMessage,
      sender,
      sendResponse,
    ) => {
      const tabId = sender.tab?.id;
      switch (message?.type) {
        case "badge":
          if (tabId === undefined) return;
          void browser.action.setBadgeText({ tabId, text: message.text });
          void browser.action.setBadgeBackgroundColor({
            tabId,
            color: message.error ? "#dc2626" : "#2563eb",
          });
          return;
        case "get-tab-mode":
          if (tabId === undefined) return;
          getMode(tabId).then(sendResponse);
          return true;
        case "set-tab-mode":
          if (tabId === undefined) return;
          void (message.mode
            ? browser.storage.session.set({ [modeKey(tabId)]: message.mode })
            : browser.storage.session.remove(modeKey(tabId)));
          return;
        case "model-loaded":
          return reply<ModelResult>(
            isModelLoaded(message.purpose).then((loaded) => ({ loaded })),
            sendResponse,
          );
        case "load-model":
          return reply<ModelResult>(
            loadModel(message.purpose).then(() => ({ loaded: true })),
            sendResponse,
          );
        case "translate-text":
          return reply<TranslateTextResult>(
            translate(message.source, message.target, message.text, message.purpose).then(
              (text) => ({
                text,
              }),
            ),
            sendResponse,
          );
        case "list-models":
          return reply<ListModelsResult>(
            listModels().then((models) => ({ models })),
            sendResponse,
          );
      }
    },
  );

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: "translate-page",
      title: "Translate page",
      contexts: ["page"],
    });
    browser.contextMenus.create({
      id: "translate-selection",
      title: 'Translate "%s"',
      contexts: ["selection"],
    });
    void syncMenu();
  });
  browser.contextMenus.onClicked.addListener((info, tab) =>
    invoke(info.menuItemId as Action, tab, info.selectionText),
  );
  // Fork: keyboard shortcuts (set in the browser's extension shortcut settings, defaults in wxt.config.ts).
  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command !== "translate-page" && command !== "translate-selection") return;
    tab ??= (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    await invoke(command, tab);
  });

  browser.tabs.onUpdated.addListener(async (tabId, info) => {
    // A full page load kills the content script before it can clear its badge.
    if (info.status === "loading") void browser.action.setBadgeText({ tabId, text: "" });
    if (info.status !== "complete") return;
    // activeTab access ends when the tab leaves the granted origin, which ends translating too.
    if (!(await getMode(tabId))) return;
    await ensureContentScript(tabId).catch(() => browser.storage.session.remove(modeKey(tabId)));
  });
  browser.tabs.onRemoved.addListener(
    (tabId) => void browser.storage.session.remove(modeKey(tabId)),
  );

  browser.storage.session.onChanged.addListener(() => void syncMenu());
  browser.tabs.onActivated.addListener(() => void syncMenu());
  browser.windows.onFocusChanged.addListener(() => void syncMenu());
  sourcePref.watch(() => void syncMenu());
  targetPref.watch(() => void syncMenu());
  languagesPref.watch(() => void syncMenu());
});

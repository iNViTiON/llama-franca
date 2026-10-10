import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  modules: ["@wxt-dev/module-svelte"],
  manifest: ({ browser }) => ({
    name: "Llama Franca",
    permissions: ["storage", "contextMenus", "activeTab", "scripting"],
    host_permissions: ["http://localhost:11434/*"],
    // Fork: default keyboard shortcuts; rebind in the browser's extension shortcuts page.
    commands: {
      "translate-page": {
        suggested_key: { default: "Alt+Shift+T" },
        description: "Translate the page, or show the original",
      },
      "translate-selection": {
        suggested_key: { default: "Alt+Shift+S" },
        description: "Translate the selected text",
      },
      [browser === "firefox" ? "_execute_browser_action" : "_execute_action"]: {
        suggested_key: { default: "Alt+Shift+L" },
        description: "Open Llama Franca",
      },
    },
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: { id: "llama-franca@th1nkk1d", data_collection_permissions: { required: ["none"] } },
      },
    }),
  }),
  hooks: {
    // The runtime-registered content script has no `matches`, so WXT exposes its popover CSS to no page.
    "build:manifestGenerated": (_wxt, manifest) => {
      for (const entry of manifest.web_accessible_resources ?? []) {
        if (typeof entry === "object") entry.matches = ["<all_urls>"];
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});

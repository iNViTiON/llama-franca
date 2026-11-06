import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  modules: ["@wxt-dev/module-svelte"],
  manifest: ({ browser }) => ({
    name: "Llama Franca",
    // Fork: fixed public key, so an unpacked build keeps the same extension id (and so its settings and shortcuts)
    // when its folder moves, like a new Nix store path after a rebuild. Firefox has its gecko id below.
    ...(browser !== "firefox" && {
      key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuoxQcUcvPfJ58aFMgAIf5c3IQw+GFWv2iGbV9JaHUkngbGBE6SBpJJzx2awgF3xGXAI6RZbMQs7Axv2HDK229F+8+975krlz+MrjvKXknI7/zFtFYmhDT/OvV4IL5mjApPSNixo4AOeKcXgOUD8lShv/Vki6CArvy8pc4wR939WSpZXkGUzcfkq5yjkSphU/3q/oq9UlDem63En27UMDnoFBtWQF+Q+vxDiNUqzqZR/38CuAh/ku25CDQlewFwT/QZBVD7ir4iiM3s8sOovkk4QTqXytqBW568VW5lnY1otJWHQlvFHyvk/jis7UV3hiOh/03GaYrB59tmlPC/hLTQIDAQAB",
    }),
    permissions: ["storage", "contextMenus", "activeTab", "scripting"],
    host_permissions: ["http://localhost:11434/*"],
    // Fork: default keyboard shortcuts; rebind in the browser's extension shortcuts page.
    commands: {
      "translate-page": {
        suggested_key: { default: "Alt+Shift+T" },
        description: "Translate the page, or show the original",
      },
      "translate-whole-page": {
        suggested_key: { default: "Alt+Shift+W" },
        description: "Translate the whole page now, or back to on-screen only",
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

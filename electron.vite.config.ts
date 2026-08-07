import { defineConfig } from "electron-vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";

// Unified build orchestrator for main + preload + renderer.
// MAIN is output as ESM (.mjs): the source is ESM-by-design ("type": "module")
// and statically imports ESM-only subpaths (e.g.
// @earendil-works/pi-ai/api/anthropic-messages, whose exports map only has an
// `import` condition). A CJS bundle would convert those to require() and fail.
// PRELOAD stays CJS (.cjs): it has no ESM-only deps and CJS preload is the most
// sandbox-compatible form. __dirname in main is replaced with import.meta.dirname.
export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
      emptyOutDir: true,
      rollupOptions: {
        input: { index: fileURLToPath(new URL("src/main/index.ts", import.meta.url)) },
        output: { format: "es", entryFileNames: "[name].mjs" },
      },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      emptyOutDir: true,
      rollupOptions: {
        input: { index: fileURLToPath(new URL("src/preload/index.cjs", import.meta.url)) },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: fileURLToPath(new URL("src/renderer", import.meta.url)),
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("src/renderer", import.meta.url)),
        "@shared": fileURLToPath(new URL("src/shared", import.meta.url)),
      },
    },
    build: {
      outDir: "out/renderer",
      emptyOutDir: true,
      rollupOptions: {
        input: { index: fileURLToPath(new URL("src/renderer/index.html", import.meta.url)) },
        output: {
          manualChunks(id) {
            return id.includes("/node_modules/.pnpm/@xterm+")
              ? "terminal-runtime"
              : undefined;
          },
        },
      },
    },
    clearScreen: false,
    server: {
      host: "127.0.0.1",
      port: 1420,
      strictPort: true,
    },
  },
});

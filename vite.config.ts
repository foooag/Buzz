import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Renderer-only Vite config. Powers `pnpm dev:web` and the Playwright webServer.
// The unified main+preload+renderer build lives in electron.vite.config.ts (added in Task 7).
export default defineConfig({
  root: fileURLToPath(new URL("./src/renderer", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/renderer", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
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
    // Electron development loads this exact loopback URL; keep the binding
    // explicit so the desktop process never falls back to an external host.
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
});

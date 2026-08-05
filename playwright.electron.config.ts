import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-electron",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  webServer: {
    command: "pnpm dev:web",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: true,
  },
});

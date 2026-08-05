import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const out = resolve(root, "_shots");
import { mkdirSync } from "node:fs";
mkdirSync(out, { recursive: true });

const APP = "http://127.0.0.1:1420/?transport=prototype";
const PROTO = "file://" + resolve(root, "designs/terminal-ai-mode/Buzz.html");

async function shoot(browser, url, name, { width = 1440, height = 900, clip, before } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  if (before) await before(page);
  await page.screenshot({ path: resolve(out, name), ...(clip ? { clip } : { fullPage: false }) });
  await page.close();
  console.log("shot:", name);
}

const CARD_CLIP = { x: 286, y: 300, width: 470, height: 200 };

const browser = await chromium.launch();

// Prototype reference (1440x900, the prototype's viewport)
await shoot(browser, PROTO, "proto-servers.png");
await shoot(browser, PROTO, "proto-cards.png", { clip: CARD_CLIP });
await shoot(browser, PROTO, "proto-servers-detail.png", {
  before: async (page) => {
    // click a host card in the prototype to open detail
    const card = await page.locator("text=web-prod-01").first();
    if (await card.count()) await card.click().catch(() => {});
    await page.waitForTimeout(300);
  },
});

// App (prototype transport)
await shoot(browser, APP, "app-servers.png");
await shoot(browser, APP, "app-cards.png", { clip: CARD_CLIP });
await shoot(browser, APP, "app-servers-detail.png", {
  before: async (page) => {
    await page.locator('[aria-label="Select web-prod-01"]').first().click().catch(() => {});
    await page.waitForTimeout(300);
  },
});
await shoot(browser, APP, "app-forwarding.png", {
  before: async (page) => {
    await page.getByRole("link", { name: "Port Forwarding" }).first().click().catch(() => {});
    await page.waitForTimeout(300);
  },
});
await shoot(browser, APP, "app-history.png", {
  before: async (page) => {
    await page.getByRole("link", { name: "History" }).first().click().catch(() => {});
    await page.waitForTimeout(300);
  },
});
await shoot(browser, APP, "app-prefs.png", {
  before: async (page) => {
    await page.locator('[aria-label="Preferences"]').first().click().catch(() => {});
    await page.waitForTimeout(400);
  },
});
// Open a local terminal session via the quick-connect bar → TerminalWorkspace + AI dock.
await shoot(browser, APP, "app-terminal-ai.png", {
  before: async (page) => {
    await page.getByPlaceholder(/Search servers/).fill("local");
    await page.getByRole("button", { name: "Connect" }).click().catch(() => {});
    await page.waitForTimeout(1200);
  },
});
await shoot(browser, APP, "app-terminal-ai-running.png", {
  before: async (page) => {
    await page.getByPlaceholder(/Search servers/).fill("local");
    await page.getByRole("button", { name: "Connect" }).click().catch(() => {});
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Send" }).click().catch(() => {});
    await page.waitForTimeout(4000);
  },
});

await browser.close();
console.log("done ->", out);

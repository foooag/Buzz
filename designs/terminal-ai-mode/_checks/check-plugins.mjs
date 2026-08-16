// Screenshot pass for the grid-dashboard plugin center.
import { chromium } from "@playwright/test";
import { createServer } from "http";
import { readFile } from "fs/promises";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = 4322;

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(ROOT, url === "/" ? "Buzz.html" : url);
  try {
    const data = await readFile(file);
    const ext = path.extname(file);
    const mime = ext === ".html" ? "text/html" : "text/plain";
    res.writeHead(200, { "content-type": mime });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("nope");
  }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

const shot = (name) => page.screenshot({ path: path.join(ROOT, "_checks", name + ".png") });

await page.goto(`http://localhost:${PORT}/Buzz.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

await page.getByRole("button", { name: "Plugins" }).first().click();
await page.waitForTimeout(500);
await shot("40-grid-default");

// drag resize the health tile wider
const tile = page.locator('[data-screen-label="Plugin tile · Prod Health Board"]');
const bb = await tile.boundingBox();
await page.mouse.move(bb.x + bb.width - 6, bb.y + bb.height - 6);
await page.mouse.down();
await page.mouse.move(bb.x + bb.width + 260, bb.y + bb.height + 130, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(400);
await shot("41-grid-after-resize");

// risk dialog from tile
await page.getByRole("button", { name: "Trigger build" }).click();
await page.waitForTimeout(300);
await shot("42-risk-dialog");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// studio
await page.getByRole("button", { name: "Create with AI" }).click();
await page.waitForTimeout(400);
await shot("43-studio-describe");
await page.getByRole("button", { name: /Build a CI\/CD panel/ }).click();
await page.waitForTimeout(4200);
await shot("44-studio-draft");
await page.getByRole("button", { name: "Preview with mock data" }).click();
await page.waitForTimeout(300);
await shot("45-studio-preview");

// prefs → plugins
await page.getByRole("button", { name: "Close studio" }).first().click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Preferences", exact: true }).click();
await page.waitForTimeout(400);
await page.getByLabel("Preferences sections").getByRole("button", { name: "Plugins", exact: true }).click();
await page.waitForTimeout(300);
await shot("46-prefs-plugins");

console.log("console errors:", errors.length ? errors : "none");
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);

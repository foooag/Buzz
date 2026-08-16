// DOM assertion pass for the grid-dashboard plugin center:
//   adaptive grid, all tiles visible at once, drag-corner resize with
//   snap + localStorage persistence, prefs-based enable/uninstall intact.
import { chromium } from "@playwright/test";
import { createServer } from "http";
import { readFile } from "fs/promises";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = 4321;

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

const results = [];
const check = (name, ok) => results.push((ok ? "PASS " : "FAIL ") + name);

await page.goto(`http://localhost:${PORT}/Buzz.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// sidebar
check("sidebar: Plugins nav item", await page.getByRole("button", { name: "Plugins" }).first().isVisible());
check("sidebar: pinned plugin shortcuts", await page.getByText("Pinned plugins").isVisible());

// center grid: both plugins visible simultaneously, no rail
await page.getByRole("button", { name: "Plugins" }).first().click();
await page.waitForTimeout(500);
check("grid: health tile visible", await page.getByText("Load 1m").isVisible());
check("grid: cicd tile visible", await page.getByText("Merge requests").isVisible());
check("grid: no left rail", (await page.getByText(/Installed · \d/).count()) === 0);
check("grid: resize handles present", (await page.locator("[data-resize-handle]").count()) >= 2);
check("grid: reset layout button", await page.getByRole("button", { name: "Reset layout" }).isVisible());

// risk dialog from tile
await page.getByRole("button", { name: "Trigger build" }).click();
await page.waitForTimeout(300);
check("risk: exact request line", await page.getByText("POST /job/api-backend/build").isVisible());
check("risk: one-shot badge", await page.getByText("one-shot").isVisible());
await page.keyboard.press("Escape");

// rollback → done
await page.getByRole("button", { name: "Rollback" }).click();
await page.waitForTimeout(250);
await page.getByRole("button", { name: "Rollback to v2.0.9" }).click();
await page.waitForTimeout(1400);
check("risk: rollback done state", await page.getByText("Rolled back").isVisible());

// drag-corner resize: widen the health tile
const tile = page.locator('[data-screen-label="Plugin tile · Prod Health Board"]');
const before = await tile.boundingBox();
const hx = before.x + before.width - 6;
const hy = before.y + before.height - 6;
await page.mouse.move(hx, hy);
await page.mouse.down();
await page.mouse.move(hx + 260, hy + 130, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(300);
const after = await tile.boundingBox();
check("resize: tile widened by drag", after.width > before.width + 180);
check("resize: tile grew taller", after.height > before.height);

// persisted to localStorage
const stored = await page.evaluate(() => localStorage.getItem("buzz.pluginLayout.v1"));
check("resize: layout persisted", Boolean(stored && stored.includes("Prod Health Board".length > 0 ? "buzz/health-board" : "")));

// survives reload
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Plugins" }).first().click();
await page.waitForTimeout(500);
const afterReload = await page.locator('[data-screen-label="Plugin tile · Prod Health Board"]').boundingBox();
check("resize: layout survives reload", afterReload.width > before.width + 180);

// reset layout restores defaults
await page.getByRole("button", { name: "Reset layout" }).click();
await page.waitForTimeout(300);
const reset = await page.locator('[data-screen-label="Plugin tile · Prod Health Board"]').boundingBox();
check("resize: reset restores default span", Math.abs(reset.width - before.width) < 40);

// prefs: disable → tile shows disabled state
await page.getByRole("button", { name: "Preferences", exact: true }).click();
await page.waitForTimeout(400);
await page.getByLabel("Preferences sections").getByRole("button", { name: "Plugins", exact: true }).click();
await page.waitForTimeout(300);
const healthSwitch = page.getByRole("switch", { name: "Prod Health Board" });
check("prefs: switch present", await healthSwitch.isVisible());
await healthSwitch.click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "Close preferences" }).click();
await page.waitForTimeout(300);
check("grid: disabled tile state", await page.getByText("Disabled", { exact: true }).first().isVisible());

// prefs: uninstall → tile removed
await page.getByRole("button", { name: "Preferences", exact: true }).click();
await page.waitForTimeout(300);
await page.getByLabel("Preferences sections").getByRole("button", { name: "Plugins", exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Uninstall Prod Health Board" }).click();
await page.waitForTimeout(250);
await page.getByRole("button", { name: "Uninstall", exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Close preferences" }).click();
await page.waitForTimeout(300);
check("grid: health tile removed", (await page.locator('[data-screen-label="Plugin tile · Prod Health Board"]').count()) === 0);
check("grid: cicd tile remains", await page.getByText("Merge requests").isVisible());

// studio flow still lands on the grid
await page.getByRole("button", { name: "Create with AI" }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Build a CI\/CD panel/ }).click();
await page.waitForTimeout(4200);
check("studio: definition card after stream", await page.getByText("definition.json").first().isVisible());
await page.getByRole("button", { name: "Preview with mock data" }).click();
await page.waitForTimeout(300);
check("studio: simulated-data badge", await page.getByText("simulated data").isVisible());
await page.getByRole("button", { name: "Agent card" }).click();
await page.waitForTimeout(250);
check("studio: agent card size", await page.getByText("same definition as the full page").isVisible());
await page.getByRole("button", { name: "Bind real data" }).click();
await page.waitForTimeout(250);
check("studio: 3 endpoint bindings", (await page.locator('input[placeholder="https://service.internal.io"]').count()) === 3);
await page.getByRole("button", { name: "Run read-only tests" }).click();
await page.waitForTimeout(250);
let guard = 0;
while ((await page.getByRole("button", { name: "Run", exact: true }).count()) > 0 && guard < 8) {
  await page.getByRole("button", { name: "Run", exact: true }).first().click();
  await page.waitForTimeout(350);
  guard += 1;
}
await page.waitForTimeout(900);
await page.getByRole("button", { name: "Review grants & install" }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Install CI\/CD Pipeline/ }).click();
await page.waitForTimeout(600);
check("studio: studio closed, back on grid", (await page.getByText("Plugin Studio").count()) === 0);
check("studio: grid still showing tiles", await page.getByText("Merge requests").isVisible());

console.log(results.join("\n"));
console.log("console errors:", errors.length ? errors : "none");
const failed = results.filter((r) => r.startsWith("FAIL")).length;
await browser.close();
server.close();
process.exit(failed || errors.length ? 1 : 0);

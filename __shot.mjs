import { _electron as electron } from "@playwright/test";
import electronExecutable from "electron";
import * as fs from "node:fs";

const URL = "http://127.0.0.1:1421";
const SHOTS = "/tmp/buzz-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const app = await electron.launch({
  executablePath: electronExecutable,
  args: [process.cwd()],
  env: { ...process.env, ELECTRON_RENDERER_URL: URL },
  timeout: 30_000,
});

const out = [];
app.process().stdout?.on("data", (c) => out.push(c));
app.process().stderr?.on("data", (c) => out.push(c));

try {
  const win = await app.firstWindow();
  await win.goto(`${URL}/#/agent`, { waitUntil: "domcontentloaded" });
  // wait for the Agent header to render
  await win.waitForSelector('h1:has-text("Agent")', { timeout: 20_000 }).catch(() => {});
  await win.waitForTimeout(1500);

  await win.screenshot({ path: `${SHOTS}/01-agent-default.png` });

  // measure the actual computed font-size of buttons that inherit the base
  const probe = await win.evaluate(() => {
    const pick = (el) => el ? {
      text: (el.textContent || "").trim().slice(0, 20),
      fontSize: getComputedStyle(el).fontSize,
      classes: el.className.baseVal ?? el.className,
    } : null;
    const buttons = [...document.querySelectorAll("button")];
    return {
      count: buttons.length,
      samples: buttons.slice(0, 12).map(pick),
    };
  });
  console.log("PROBE", JSON.stringify(probe, null, 2));

  console.log("OK screenshots written to", SHOTS);
} catch (e) {
  console.log("ERROR", e.message);
  console.log("MAIN OUTPUT:\n" + Buffer.concat(out).toString().slice(-3000));
} finally {
  await app.close().catch(() => {});
}

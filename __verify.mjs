import { _electron as electron } from "@playwright/test";
import electronExecutable from "electron";

const URL = "http://127.0.0.1:1421";
const SHOTS = "/tmp/buzz-shots";
const app = await electron.launch({
  executablePath: electronExecutable,
  args: [process.cwd()],
  env: { ...process.env, ELECTRON_RENDERER_URL: URL },
  timeout: 30_000,
});
try {
  const win = await app.firstWindow();
  await win.goto(`${URL}/#/agent`, { waitUntil: "domcontentloaded" });
  await win.waitForSelector('button', { timeout: 20_000 });
  await win.waitForTimeout(1500);

  await win.screenshot({ path: `${SHOTS}/02-agent-fixed.png` });

  const report = await win.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const tally = {};
    for (const el of btns) {
      const fs = getComputedStyle(el).fontSize;
      tally[fs] = (tally[fs] || 0) + 1;
    }
    return { totalButtons: btns.length, fontSizeTally: tally };
  });
  console.log("RESULT", JSON.stringify(report));
} finally {
  await app.close().catch(() => {});
}

import { _electron as electron } from "@playwright/test";
import electronExecutable from "electron";

const URL = "http://127.0.0.1:1421";
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
  await win.waitForTimeout(1000);

  const report = await win.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const info = (el) => {
      const cs = getComputedStyle(el);
      return {
        text: (el.textContent || "").trim().slice(0, 14) || "(icon)",
        fontSize: cs.fontSize,
        // walk up the tree to find what's setting font-size
        inheritedFrom: (() => {
          let node = el.parentElement;
          while (node) {
            const s = getComputedStyle(node).fontSize;
            if (s) return s + " <" + node.tagName + "." + (node.className?.baseVal ?? node.className ?? "").slice(0, 30) + ">";
            node = node.parentElement;
          }
          return "?";
        })(),
      };
    };
    // Check if the button font:inherit rule is layered or not
    const rules = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.cssText && rule.cssText.includes("button, input") && rule.cssText.includes("font")) {
            rules.push({ layer: rule.parentRule?.name ?? "(unlayered)", media: rule.parentRule?.media?.mediaText ?? "", text: rule.cssText.slice(0, 80) });
          }
        }
      } catch {}
    }
    return { buttons: btns.slice(0, 4).map(info), buttonFontRules: rules };
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await app.close().catch(() => {});
}

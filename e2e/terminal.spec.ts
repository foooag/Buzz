import { expect, test } from "@playwright/test";

test("opens, splits, switches, and closes local terminal workspaces", async ({ page }) => {
  await page.goto("/?transport=deterministic-terminal");
  await page.keyboard.press("Meta+L");
  await expect(page.getByRole("button", { name: "Local Terminal 1", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("button", { name: "Split right" }).click();
  await expect(page.getByTestId("terminal-pane")).toHaveCount(2);
  await page.getByRole("button", { name: "Close active pane" }).click();
  await expect(page.getByTestId("terminal-pane")).toHaveCount(1);
  await page.keyboard.press("Meta+W");
  await expect(page.getByRole("heading", { name: "Servers" })).toBeVisible();
});

test("keeps both sessions mounted when switching tabs (no black screen)", async ({ page }) => {
  await page.goto("/?transport=deterministic-terminal");
  await page.keyboard.press("Meta+L");
  await page.keyboard.press("Meta+L");

  // Two separate sessions → both panes stay mounted (keep-alive) instead of
  // unmounting the inactive one, which produced the black-screen-after-switch.
  await expect(page.getByTestId("terminal-pane")).toHaveCount(2);

  // Switch to session 1 and back to session 2 via keyboard shortcuts; the
  // panes must remain mounted throughout.
  await page.keyboard.press("Meta+1");
  await expect(page.getByTestId("terminal-pane")).toHaveCount(2);
  await page.keyboard.press("Meta+2");
  await expect(page.getByTestId("terminal-pane")).toHaveCount(2);
});

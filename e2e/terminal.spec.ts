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

import { expect, test } from "@playwright/test";

test("boots into the keyboard-reachable Servers workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Servers" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Preferences" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Find a host or enter an SSH command" })).toBeVisible();
});

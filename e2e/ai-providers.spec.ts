import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("terminus-locale", "en"));
  await page.goto("/?transport=deterministic-ai");
  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("button", { name: "AI Providers" }).click();
});

test("matches the provider-list prototype", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "AI providers" })).toBeVisible();
  await expect(page.getByText("Claude Sonnet 5")).toBeVisible();
  await expect(page.getByText("Kimi K2")).toBeVisible();
  await expect(page.getByText("Llama 3.1 (local)")).toBeVisible();
  await expect(page.getByText("Connected · 412 ms")).toBeVisible();
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("ai-providers-list.png", {
    animations: "disabled",
    maxDiffPixels: 400,
  });
});

test("matches the add-provider modal prototype", async ({ page }) => {
  await page.getByRole("button", { name: "Add provider" }).click();
  await expect(
    page.getByRole("heading", { name: "Add AI provider" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Provider type" })).toHaveValue(
    "anthropic",
  );
  await expect(page.getByRole("textbox", { name: "Base URL" })).toHaveValue(
    "https://api.anthropic.com",
  );
  await expect(page.locator("form")).toHaveCSS("width", "480px");
  await expect(page).toHaveScreenshot("ai-provider-add-modal.png", {
    animations: "disabled",
    maxDiffPixels: 600,
  });
});

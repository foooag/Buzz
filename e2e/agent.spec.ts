import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("terminus-locale", "en"));
  await page.goto("/?transport=prototype");
});

test("opens the Agent panel and shows the mention picker on @", async ({ page }) => {
  await page.getByRole("link", { name: "Agent" }).click();
  await expect(page.getByRole("heading", { name: "Agent", exact: true })).toBeVisible();
  await expect(page.getByText("Agent standing by")).toBeVisible();
  await page.getByLabel("Message agent").fill("@");
  await expect(page.getByText("Mention target")).toBeVisible();
  await expect(page.getByTestId("agent-page").getByText("Groups")).toBeVisible();
  await expect(page.getByTestId("agent-page").getByText("Servers")).toBeVisible();
  await expect(page.getByRole("option", { name: /Production/ })).toBeVisible();
  const pickerWidth = await page.getByRole("listbox").evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(pickerWidth).toBeGreaterThanOrEqual(317);
  expect(pickerWidth).toBeLessThanOrEqual(321);
});

test("runs a multi-host task and shows the per-host progress rail", async ({ page }) => {
  await page.getByRole("link", { name: "Agent" }).click();
  await page.getByRole("button", { name: "Docker sync" }).click();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Progress")).toBeVisible();
  await expect(page.getByText("docker ps --format", { exact: false }).first()).toBeVisible();
  const rail = page.locator('[data-screen-label="Agent progress rail"]');
  await expect(rail.getByText("web-prod-01")).toBeVisible();
  await expect(rail.getByText("web-prod-02")).toBeVisible();
  const railWidth = await rail.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(railWidth).toBeGreaterThanOrEqual(291);
  expect(railWidth).toBeLessThanOrEqual(293);
  await expect(
    page.getByRole("heading", { name: "Confirm high-risk command", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const dialog = page.locator("div.pop-in").filter({
    hasText: "Confirm high-risk command",
  });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(250);
  const dialogWidth = await dialog.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(dialogWidth).toBeGreaterThanOrEqual(559);
  expect(dialogWidth).toBeLessThanOrEqual(561);
  await page.getByRole("button", { name: "Run command", exact: true }).click();
});

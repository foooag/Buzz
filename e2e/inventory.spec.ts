import { expect, test } from "@playwright/test";

test("creates, persists, switches, and deletes synthetic encrypted inventory", async ({ page }) => {
  await page.goto("/?transport=deterministic-inventory");
  await expect(page.getByRole("heading", { name: "No vaults yet" })).toBeVisible();

  await page.getByRole("button", { name: "Create vault" }).click();
  await page.getByRole("textbox", { name: "Vault name" }).fill("Synthetic Vault");
  await page.getByRole("button", { name: "Save vault" }).click();
  await page.getByRole("button", { name: "New Server" }).first().click();
  const hostPanel = page.getByTestId("host-form-panel");
  const hostPanelScroll = page.getByTestId("host-form-scroll-region");
  await expect(hostPanel).toBeVisible();
  expect(
    await hostPanel.evaluate((element) => element.getBoundingClientRect().height <= window.innerHeight),
  ).toBe(true);
  expect(
    await hostPanelScroll.evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  await page.getByRole("textbox", { name: "Name *", exact: true }).fill("Synthetic Host");
  await page.getByRole("textbox", { name: "Address / hostname *" }).fill("demo.example.test");
  await page.getByRole("textbox", { name: "Tags" }).fill("Lab, Demo");
  await page.getByRole("button", { name: "Create server" }).click();
  await expect(page.locator("header").getByRole("heading", { name: "Synthetic Host" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Select Synthetic Host" }).click();
  await expect(page.locator("header").getByRole("heading", { name: "Synthetic Host" })).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete host" }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("heading", { name: "No servers match" })).toBeVisible();
});

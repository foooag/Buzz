import { expect, test } from "@playwright/test";

test("mentions a server and runs a deterministic Agent task", async ({ page }) => {
  await page.goto("/?transport=prototype");
  await page.getByRole("link", { name: "Agent" }).click();

  const composer = page.getByRole("textbox", { name: "Agent command" });
  await expect(composer).toBeVisible();
  await composer.fill("@");
  await expect(page.getByRole("option", { name: "Servers" })).toBeVisible();
  await page.getByRole("option", { name: "Servers" }).click();
  await page.getByRole("option", { name: /web-prod-01/ }).click();
  await composer.press("End");
  await composer.type(" check uptime");
  await composer.press("Enter");

  await expect(page.getByText(/deterministic Agent is ready/)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Host progress" })
    .getByText("host-1")).toBeVisible();
});

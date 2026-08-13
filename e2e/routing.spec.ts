import { expect, test } from "@playwright/test";

test("supports deep links and browser history across workspace pages", async ({
  page,
}) => {
  await page.goto("/?transport=prototype#/sftp");

  await expect(page.getByRole("heading", { name: /^SFTP$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "SFTP" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByRole("link", { name: "Port Forwarding" }).click();
  await expect(page).toHaveURL(/\?transport=prototype#\/forwarding$/);
  await expect(
    page.getByRole("heading", { name: "Port Forwarding" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\?transport=prototype#\/history$/);
  await expect(
    page.getByRole("heading", { name: "History", exact: true }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\?transport=prototype#\/forwarding$/);
  await expect(page.getByRole("link", { name: "Port Forwarding" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("redirects unknown routes to Servers", async ({ page }) => {
  await page.goto("/#/unknown-page");

  await expect(page).toHaveURL(/#\/servers$/);
  await expect(page.getByRole("heading", { name: "Servers" })).toBeVisible();
});

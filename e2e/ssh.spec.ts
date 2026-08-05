import { expect, test } from "@playwright/test";

test("verifies, opens, reconnects, splits, and closes a synthetic SSH session", async ({ page }) => {
  await page.goto("/?transport=deterministic-ssh");
  await page.getByRole("button", { name: "Create vault" }).click();
  await page.getByRole("textbox", { name: "Vault name" }).fill("Synthetic SSH Vault");
  await page.getByRole("button", { name: "Save vault" }).click();
  await page.getByRole("button", { name: "New Server" }).first().click();
  await page.getByRole("textbox", { name: "Name *", exact: true }).fill("Synthetic SSH Host");
  await page.getByRole("textbox", { name: "Address / hostname *" }).fill("ssh.example.test");
  await page.getByRole("textbox", { name: "Username" }).fill("tester");
  await page.getByLabel("Server password").fill("synthetic-password");
  await page.getByRole("checkbox", { name: "Save password for future connections" }).check();
  await page.getByRole("button", { name: "Create server" }).click();

  await page.reload();
  await page.getByRole("button", { name: "Select Synthetic SSH Host" }).click();
  await page.getByRole("button", { name: "Connect", exact: true }).nth(1).click();
  await expect(page.getByRole("form", { name: "Connect SSH" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Verify SSH host key" })).toContainText("SHA256:synthetic");
  await page.getByRole("button", { name: "Trust and connect" }).click();
  await expect(page.getByTestId("terminal-pane")).toHaveCount(1);

  await expect(page.getByRole("button", { name: "Restart terminal" })).toBeVisible();
  await page.getByRole("button", { name: "Restart terminal" }).click();
  await expect(page.getByRole("button", { name: "Restart terminal" })).not.toBeVisible();
  await page.getByRole("button", { name: "Split right" }).click();
  await expect(page.getByTestId("terminal-pane")).toHaveCount(2);
  await page.getByRole("button", { name: "Close active pane" }).click();
  await page.keyboard.press("Meta+W");
  await expect(page.getByRole("heading", { name: "Servers" })).toBeVisible();
});

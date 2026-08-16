import { expect, test } from "@playwright/test";

test("mentions a server and runs a deterministic Agent task", async ({ page }) => {
  await page.goto("/?transport=prototype");
  await page.getByRole("link", { name: "Agent" }).click();

  const composer = page.getByRole("textbox", { name: "Agent command" });
  await expect(composer).toBeVisible();
  await composer.fill("@");
  const server = page.getByRole("option", { name: /web-prod-01/ });
  await expect(server).toBeVisible();
  await server.click();
  await composer.press("End");
  await composer.type(" check uptime");
  await composer.press("Enter");

  const reasoning = page.locator("details").filter({ hasText: "Reasoning" });
  await expect(reasoning).toContainText("Running 1 command");
  await expect(page.getByText(/deterministic Agent is ready/)).toBeVisible();
  await expect(page.getByText("Final line remains visible.")).toBeVisible();
  await expect(reasoning).toContainText(
    "Inspecting the deterministic host before running uptime.",
  );
  await expect(reasoning).toContainText("Ran 1 command");
  await expect(reasoning).toContainText("uptime");
  await expect(reasoning).not.toContainText("Docker response content is complete.");

  const timelineOrder = await page.evaluate(() => {
    const reasoningElement = [...document.querySelectorAll("details")]
      .find((element) => element.textContent?.includes("Reasoning"));
    const finalElement = [...document.querySelectorAll("li")]
      .find((element) => element.textContent?.includes("Final line remains visible."));
    return reasoningElement && finalElement
      ? Boolean(reasoningElement.compareDocumentPosition(finalElement) & Node.DOCUMENT_POSITION_FOLLOWING)
      : false;
  });
  expect(timelineOrder).toBe(true);
  const progress = page.getByRole("complementary", { name: "Host progress" });
  await expect(progress.getByText("web-prod-01")).toBeVisible();

  await page.setViewportSize({ width: 666, height: 800 });
  await progress.locator("code").evaluate((element) => {
    element.textContent = `docker inspect ${"unbroken-command-token".repeat(30)}`;
  });

  await expect.poll(() => progress.evaluate((element) => (
    element.clientWidth <= 292 && element.scrollWidth === element.clientWidth
  ))).toBe(true);
  await expect.poll(() => page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))).toEqual({ clientWidth: 666, scrollWidth: 666 });
});

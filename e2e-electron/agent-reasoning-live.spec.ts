import { _electron as electron, expect, test } from "@playwright/test";
import electronExecutable from "electron";

test.skip(
  process.env.BUZZ_LIVE_AGENT_E2E !== "1",
  "Requires the locally configured AI provider.",
);

test("streams live provider reasoning into the Electron Agent UI", async ({}, testInfo) => {
  test.setTimeout(90_000);
  const application = await electron.launch({
    executablePath: electronExecutable as unknown as string,
    args: [process.cwd()],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: "http://127.0.0.1:1421",
    },
  });
  const mainOutput: Buffer[] = [];
  application.process().stdout?.on("data", (chunk: Buffer) => mainOutput.push(chunk));
  application.process().stderr?.on("data", (chunk: Buffer) => mainOutput.push(chunk));
  try {
    const window = await application.firstWindow();
    await window.goto("http://127.0.0.1:1421/#/agent");

    const composer = window.getByRole("textbox", { name: "Agent command" });
    await expect(composer).toBeEditable();
    await composer.fill(
      "Reason carefully about whether 1234567 multiplied by 89 is greater than 100000000. " +
      "Do not use tools. End the final answer with STREAM_OK.",
    );
    const send = window.getByRole("button", { name: "Send Agent command" });
    await send.click();

    const stop = window.getByRole("button", { name: "Stop Agent" });
    await expect(stop).toBeVisible();
    const reasoningBlocks = window.locator("details").filter({ hasText: "Reasoning" });
    const reasoning = reasoningBlocks.last();
    await expect(reasoning).toHaveAttribute("open", "");
    await expect.poll(
      async () => (await reasoning.locator("p").textContent())?.trim().length ?? 0,
      { timeout: 30_000 },
    ).toBeGreaterThan(12);
    await stop.click();
    await expect(send).toBeVisible({ timeout: 10_000 });
  } finally {
    await application.close();
    await testInfo.attach("electron-main.log", {
      body: Buffer.concat(mainOutput),
      contentType: "text/plain",
    });
  }
});

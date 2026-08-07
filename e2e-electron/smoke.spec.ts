import { _electron as electron, expect, test } from "@playwright/test";
import electronExecutable from "electron";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("boots Electron and reaches the isolated desktop services", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "terminus-electron-e2e-"));
  const application = await electron.launch({
    executablePath: electronExecutable as unknown as string,
    args: [process.cwd(), `--user-data-dir=${dataDirectory}`],
    env: {
      ...process.env,
      TERMINUS_ISOLATED_E2E: "1",
      TERMINUS_E2E_DATA_DIR: dataDirectory,
    },
  });
  try {
    const window = await application.firstWindow();
    await expect(window.getByRole("heading", { level: 1 })).toHaveText(/Servers|服务器/);
    const health = await window.evaluate(() => window.terminus?.invoke("app_health", undefined));
    expect(health).toEqual({
      ok: true,
      data: { name: "buzz", version: "0.0.1" },
    });
    const desktopRoundTrip = await window.evaluate(async () => {
      const bridge = window.terminus;
      if (!bridge) throw new Error("preload bridge missing");
      const created = await bridge.invoke("inventory_create_vault", {
        input: { name: "Electron E2E" },
      });
      const vaults = await bridge.invoke<Array<{ name: string }>>(
        "inventory_list_vaults",
        null,
      );

      let output = "";
      let resolveOutput = () => undefined;
      const receivedOutput = new Promise<void>((resolve) => {
        resolveOutput = resolve;
      });
      const opened = await bridge.stream<
        { type: string; data?: number[] },
        { sessionId: string }
      >("terminal_open", { size: { cols: 80, rows: 24 } }, (event) => {
        if (event.type !== "output" || !event.data) return;
        output += String.fromCharCode(...event.data);
        if (output.includes("electron-rpc")) resolveOutput();
      });
      if (!opened.ok) throw new Error(opened.error.code);
      await bridge.invoke("terminal_write", {
        sessionId: opened.data.sessionId,
        data: Array.from(new TextEncoder().encode("printf electron-rpc\\n")),
      });
      await Promise.race([
        receivedOutput,
        new Promise((_, reject) => setTimeout(() => reject(new Error("terminal event timeout")), 3_000)),
      ]);
      await bridge.invoke("terminal_close", { sessionId: opened.data.sessionId });
      return { created, vaults, output };
    });
    expect(desktopRoundTrip.created).toMatchObject({
      ok: true,
      data: { name: "Electron E2E" },
    });
    expect(desktopRoundTrip.vaults).toMatchObject({
      ok: true,
      data: [{ name: "Electron E2E" }],
    });
    expect(desktopRoundTrip.output).toContain("electron-rpc");
    expect(await window.evaluate(() => typeof process)).toBe("undefined");
  } finally {
    await application.close();
  }
});

test("keeps the Agent composer cursor stable during sequential typing", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "buzz-agent-e2e-"));
  const application = await electron.launch({
    executablePath: electronExecutable as unknown as string,
    args: [process.cwd(), `--user-data-dir=${dataDirectory}`],
    env: {
      ...process.env,
      TERMINUS_ISOLATED_E2E: "1",
      TERMINUS_E2E_DATA_DIR: dataDirectory,
    },
  });
  try {
    const window = await application.firstWindow();
    const created = await window.evaluate(() => window.terminus?.invoke(
      "ai_create_provider_config",
      {
        input: {
          providerKind: "ollama",
          name: "Electron E2E Ollama",
          baseUrl: "http://127.0.0.1:9",
          modelId: "e2e-model",
          isDefault: true,
        },
      },
    ));
    expect(created).toMatchObject({ ok: true });

    await window.getByRole("link", { name: "Agent" }).click();
    const composer = window.getByRole("textbox", { name: "Message agent" });
    await expect(composer).toBeEnabled();
    await composer.pressSequentially("whoami", { delay: 50 });

    await expect(composer).toHaveValue("whoami");
    expect(await composer.evaluate((element) => {
      const input = element as HTMLTextAreaElement;
      return {
        active: document.activeElement === element,
        anchorOffset: input.selectionStart,
        focusOffset: input.selectionEnd,
      };
    })).toEqual({
      active: true,
      anchorOffset: 6,
      focusOffset: 6,
    });
  } finally {
    await application.close();
  }
});

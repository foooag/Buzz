import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMMAND_NAMES, isCommandName } from "../../electron/command-names";

const root = process.cwd();

describe("Electron command allowlist", () => {
  it("contains no duplicates and rejects arbitrary renderer input", () => {
    expect(new Set(COMMAND_NAMES).size).toBe(COMMAND_NAMES.length);
    expect(isCommandName("terminal_open")).toBe(true);
    expect(isCommandName("shell_exec_unrestricted")).toBe(false);
  });

  it("keeps every allowlisted command registered in Electron domain handlers", () => {
    const dispatcher = [
      "app.ts", "ai/commands.ts", "inventory/commands.ts", "terminal/commands.ts",
      "ssh/commands.ts", "forwarding/commands.ts", "sftp/commands.ts",
    ].map((file) => readFileSync(`${root}/electron/domains/${file}`, "utf8")).join("\n");
    for (const command of COMMAND_NAMES) {
      expect(dispatcher, command).toMatch(new RegExp(`\\b${command}\\s*:`));
    }
    const registered = [...dispatcher.matchAll(/^\s{4}([a-z][a-z0-9_]+)\s*:/gm)]
      .map((match) => match[1])
      .filter((name) => COMMAND_NAMES.includes(name as (typeof COMMAND_NAMES)[number]))
      .sort();
    expect(registered).toEqual([...COMMAND_NAMES].sort());
  });
});

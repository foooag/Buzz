import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultTerminalPreferences,
  loadTerminalPreferences,
  saveTerminalPreferences,
} from "./terminalPreferences";

describe("terminal preferences", () => {
  beforeEach(() => localStorage.clear());

  it("persists and reloads real terminal settings", () => {
    saveTerminalPreferences({
      ...defaultTerminalPreferences,
      rightClickPaste: false,
      terminalBell: true,
      optionAsMeta: false,
      fontId: "f-fira",
      fontSize: 17,
      keepaliveInterval: 45,
      scrollbackLines: 25_000,
    });

    expect(loadTerminalPreferences()).toEqual({
      rightClickPaste: false,
      terminalBell: true,
      optionAsMeta: false,
      fontId: "f-fira",
      fontSize: 17,
      keepaliveInterval: 45,
      scrollbackLines: 25_000,
    });
  });

  it("bounds corrupted numeric preferences and rejects unknown fonts", () => {
    localStorage.setItem(
      "terminus.terminalPreferences",
      JSON.stringify({
        ...defaultTerminalPreferences,
        fontId: "missing",
        fontSize: 500,
        keepaliveInterval: -1,
        scrollbackLines: 1,
      }),
    );

    expect(loadTerminalPreferences()).toEqual({
      ...defaultTerminalPreferences,
      fontSize: 28,
      keepaliveInterval: 0,
      scrollbackLines: 100,
    });
  });
});

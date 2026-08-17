import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultQuickScriptPreferences,
  loadQuickScriptPreferences,
  saveQuickScriptPreferences,
} from "@/features/ai/quickScriptPreferences";

beforeEach(() => localStorage.clear());

describe("quickScriptPreferences", () => {
  it("defaults to AI generation on", () => {
    expect(loadQuickScriptPreferences()).toEqual(defaultQuickScriptPreferences);
    expect(defaultQuickScriptPreferences.useAiGeneration).toBe(true);
  });
  it("persists partial updates and ignores garbage", () => {
    saveQuickScriptPreferences({ useAiGeneration: false });
    expect(loadQuickScriptPreferences().useAiGeneration).toBe(false);
    localStorage.setItem("terminus.quickScriptsPreferences", "{not json");
    expect(loadQuickScriptPreferences().useAiGeneration).toBe(true);
  });
});

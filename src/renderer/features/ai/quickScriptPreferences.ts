export type QuickScriptPreferences = { useAiGeneration: boolean };

export const defaultQuickScriptPreferences: QuickScriptPreferences = { useAiGeneration: true };

const STORAGE_KEY = "terminus.quickScriptsPreferences";

export function loadQuickScriptPreferences(): QuickScriptPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultQuickScriptPreferences };
    const parsed = JSON.parse(raw) as Partial<QuickScriptPreferences>;
    return { useAiGeneration: parsed.useAiGeneration !== false };
  } catch {
    return { ...defaultQuickScriptPreferences };
  }
}

export function saveQuickScriptPreferences(preferences: QuickScriptPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* 非致命 */
  }
}

export async function clearQuickScriptData(): Promise<void> {
  const { quickScriptApi } = await import("./quickScriptApi");
  await quickScriptApi.clearData();
}

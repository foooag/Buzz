import { PREF_FONTS } from "./prototypeData";

export type TerminalPreferences = {
  rightClickPaste: boolean;
  terminalBell: boolean;
  optionAsMeta: boolean;
  fontId: string;
  fontSize: number;
  keepaliveInterval: number;
  scrollbackLines: number;
};

const STORAGE_KEY = "terminus.terminalPreferences";

export const defaultTerminalPreferences: TerminalPreferences = {
  rightClickPaste: true,
  terminalBell: false,
  optionAsMeta: true,
  fontId: "f-jet",
  fontSize: 13,
  keepaliveInterval: 30,
  scrollbackLines: 10_000,
};

export function loadTerminalPreferences(): TerminalPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<TerminalPreferences>;
    return normalizeTerminalPreferences({ ...defaultTerminalPreferences, ...parsed });
  } catch {
    return defaultTerminalPreferences;
  }
}

export function saveTerminalPreferences(preferences: TerminalPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeTerminalPreferences(preferences)));
}

export function terminalFontFamily(fontId: string): string {
  return (
    PREF_FONTS.find((font) => font.id === fontId)?.stack ??
    PREF_FONTS.find((font) => font.id === defaultTerminalPreferences.fontId)?.stack ??
    "ui-monospace, monospace"
  );
}

function normalizeTerminalPreferences(
  preferences: TerminalPreferences,
): TerminalPreferences {
  return {
    rightClickPaste: Boolean(preferences.rightClickPaste),
    terminalBell: Boolean(preferences.terminalBell),
    optionAsMeta: Boolean(preferences.optionAsMeta),
    fontId: PREF_FONTS.some((font) => font.id === preferences.fontId)
      ? preferences.fontId
      : defaultTerminalPreferences.fontId,
    fontSize: clamp(preferences.fontSize, 9, 28, defaultTerminalPreferences.fontSize),
    keepaliveInterval: clamp(
      preferences.keepaliveInterval,
      0,
      600,
      defaultTerminalPreferences.keepaliveInterval,
    ),
    scrollbackLines: clamp(
      preferences.scrollbackLines,
      100,
      100_000,
      defaultTerminalPreferences.scrollbackLines,
    ),
  };
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

import type { ITheme } from "@xterm/xterm";

export type TerminalThemeDefinition = {
  id: string;
  name: string;
  theme: Readonly<ITheme>;
};

export const terminalThemes = [
  theme("termius-dark", "Termius Dark", "#1f2233", "#e6e9f2", "#ffffff", "#59617a"),
  theme("termius-light", "Termius Light", "#f7f8fa", "#2d3442", "#4055cc", "#c8d0e0"),
  theme("basic", "Basic", "#ffffff", "#000000", "#000000", "#b5d5ff"),
  theme("homebrew", "Homebrew", "#000000", "#00ff00", "#23ff18", "#315b31"),
  theme("grass", "Grass", "#13773d", "#fffbe6", "#f7ff8a", "#58a56f"),
  theme("man-page", "Man Page", "#fff7c7", "#222222", "#7b3f00", "#e5d58f"),
  theme("novel", "Novel", "#dfdbc3", "#3b352d", "#706b55", "#b9b39b"),
  theme("ocean", "Ocean", "#224fbc", "#ffffff", "#f7f7d4", "#4e73ce"),
  theme("pro", "Pro", "#000000", "#f2f2f2", "#f2f2f2", "#4d4d4d"),
  theme("red-sands", "Red Sands", "#7a251e", "#fff5e6", "#ffffff", "#a95645"),
  theme("solarized-dark", "Solarized Dark", "#002b36", "#839496", "#93a1a1", "#174c57"),
  theme("solarized-light", "Solarized Light", "#fdf6e3", "#657b83", "#586e75", "#e4ddc9"),
  theme("silver-aerogel", "Silver Aerogel", "#b9b9b9", "#1f1f1f", "#202020", "#929292"),
] as const satisfies readonly TerminalThemeDefinition[];

export type TerminalThemeId = (typeof terminalThemes)[number]["id"];

export const defaultTerminalThemeId: TerminalThemeId = "pro";

export function getTerminalTheme(id: string): Readonly<ITheme> {
  return (
    terminalThemes.find((candidate) => candidate.id === id)?.theme ??
    terminalThemes.find((candidate) => candidate.id === defaultTerminalThemeId)!
      .theme
  );
}

function theme(
  id: string,
  name: string,
  background: string,
  foreground: string,
  cursor: string,
  selectionBackground: string,
): TerminalThemeDefinition {
  return {
    id,
    name,
    theme: {
      background,
      foreground,
      cursor,
      cursorAccent: background,
      selectionBackground,
      black: "#1b1d23",
      red: "#d95468",
      green: "#8bd49c",
      yellow: "#ebbf83",
      blue: "#539afc",
      magenta: "#b62d65",
      cyan: "#70c0ba",
      white: "#ffffff",
      brightBlack: "#686868",
      brightRed: "#ff6b7a",
      brightGreen: "#a8e6b5",
      brightYellow: "#f6d59b",
      brightBlue: "#78b4ff",
      brightMagenta: "#d46b9b",
      brightCyan: "#93ddd7",
      brightWhite: "#ffffff",
    },
  };
}


// Non-sensitive presentation catalogs for terminal themes, fonts, and the
// documented keyboard mapping. Known hosts, identities, and SFTP associations
// are loaded from their real backends.

export type PrefTheme = { id: string; name: string; fg: string; bg: string };
export const PREF_THEMES: PrefTheme[] = [
  { id: "th-termius-dark", name: "Termius Dark", fg: "#f2f2f2", bg: "#0b0f14" },
  { id: "th-termius-light", name: "Termius Light", fg: "#1c1d1f", bg: "#fafafa" },
  { id: "th-basic", name: "Basic", fg: "#e8e8e8", bg: "#000000" },
  { id: "th-homebrew", name: "Homebrew", fg: "#33dd33", bg: "#000000" },
  { id: "th-grass", name: "Grass", fg: "#fff700", bg: "#1a1a00" },
  { id: "th-man-page", name: "Man Page", fg: "#b4d6c4", bg: "#fef3e3" },
  { id: "th-novel", name: "Novel", fg: "#3a2a1a", bg: "#dfdbc6" },
  { id: "th-ocean", name: "Ocean", fg: "#cee1e8", bg: "#1a2638" },
  { id: "th-pro", name: "Pro", fg: "#f2f2f2", bg: "#000000" },
  { id: "th-red-sands", name: "Red Sands", fg: "#d4c9b8", bg: "#7a2424" },
  { id: "th-solarized-dark", name: "Solarized Dark", fg: "#93a1a1", bg: "#002b36" },
  { id: "th-solarized-light", name: "Solarized Light", fg: "#586e75", bg: "#fdf6e3" },
  { id: "th-silver-aerogel", name: "Silver Aerogel", fg: "#b0b8c4", bg: "#15181f" },
];

export type PrefFont = { id: string; name: string; stack: string };
export const PREF_FONTS: PrefFont[] = [
  { id: "f-scp", name: "Source Code Pro", stack: '"Source Code Pro", ui-monospace, monospace' },
  { id: "f-operator", name: "Operator Mono", stack: '"Operator Mono", ui-monospace, monospace' },
  { id: "f-fira", name: "Fira Mono", stack: '"Fira Mono", ui-monospace, monospace' },
  { id: "f-inconsolata", name: "Inconsolata-g", stack: '"Inconsolata", ui-monospace, monospace' },
  { id: "f-anon", name: "Anonymous Pro", stack: '"Anonymous Pro", ui-monospace, monospace' },
  { id: "f-ubuntu", name: "Ubuntu Mono", stack: '"Ubuntu Mono", ui-monospace, monospace' },
  { id: "f-droid", name: "Droid Sans Mono", stack: '"Droid Sans Mono", ui-monospace, monospace' },
  { id: "f-dejavu", name: "Dejavu Sans Mono", stack: '"DejaVu Sans Mono", ui-monospace, monospace' },
  { id: "f-pt", name: "PT Mono", stack: '"PT Mono", ui-monospace, monospace' },
  { id: "f-andale", name: "Andale Mono", stack: '"Andale Mono", ui-monospace, monospace' },
  { id: "f-jet", name: "JetBrains Mono", stack: '"JetBrains Mono", ui-monospace, monospace' },
];

export type PrefShortcut = { id: string; group: string; action: string; keys: string[] };
export const PREF_SHORTCUTS: PrefShortcut[] = [
  { id: "k-1", group: "Tabs", action: "Switch to tab 1–9", keys: ["⌘", "1…9"] },
  { id: "k-2", group: "Tabs", action: "Next tab", keys: ["⌘", "⇧", "]"] },
  { id: "k-3", group: "Tabs", action: "Previous tab", keys: ["⌘", "⇧", "["] },
  { id: "k-4", group: "Tabs", action: "Close tab", keys: ["⌘", "W"] },
  { id: "k-5", group: "Navigation", action: "Open Servers", keys: ["⌘", "T"] },
  { id: "k-6", group: "Navigation", action: "New local terminal", keys: ["⌘", "L"] },
  { id: "k-7", group: "Navigation", action: "Port forwarding", keys: ["⌘", "P"] },
  { id: "k-8", group: "Terminal", action: "Copy / Paste / Select all", keys: ["⌘", "C / V / A"] },
  { id: "k-9", group: "Terminal", action: "Clear scrollback", keys: ["⌘", "K"] },
  { id: "k-10", group: "Terminal", action: "Search terminal", keys: ["⌘", "F"] },
  { id: "k-11", group: "Commands", action: "Command palette", keys: ["⌘", "S"] },
  { id: "k-12", group: "Commands", action: "Search commands", keys: ["⌘", "⇧", "S"] },
  { id: "k-13", group: "Layout", action: "Toggle left panel", keys: ["⌥", "⇧", "B"] },
  { id: "k-14", group: "AI", action: "Toggle AI mode", keys: ["⌘", "I"] },
];

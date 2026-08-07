import { useEffect } from "react";

export type TerminalShortcutActions = {
  openLocal: () => void;
  openServers: () => void;
  openPortForwarding: () => void;
  closeActive: () => void;
  activateIndex: (index: number) => void;
  activateRelative: (offset: number) => void;
  toggleCommands: (focusSearch: boolean) => void;
  toggleSidebar: () => void;
  clearActive: () => void;
  searchActive: () => void;
  copyActive: () => void;
  pasteActive: () => void;
  selectAll: () => void;
};

export function useTerminalShortcuts(actions: TerminalShortcutActions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      let handled = true;

      if (command && !event.shiftKey && key === "l") actions.openLocal();
      else if (command && !event.shiftKey && key === "t") actions.openServers();
      else if (command && !event.shiftKey && key === "p") actions.openPortForwarding();
      else if (command && !event.shiftKey && key === "w") actions.closeActive();
      else if (command && !event.shiftKey && /^[1-9]$/.test(key))
        actions.activateIndex(Number(key) - 1);
      else if (command && event.shiftKey && event.key === "]")
        actions.activateRelative(1);
      else if (command && event.shiftKey && event.key === "[")
        actions.activateRelative(-1);
      else if (command && key === "s") actions.toggleCommands(event.shiftKey);
      else if (command && !event.shiftKey && key === "k") actions.clearActive();
      else if (command && !event.shiftKey && key === "f") actions.searchActive();
      else if (
        command &&
        !event.shiftKey &&
        key === "c" &&
        !window.getSelection()?.toString()
      ) actions.copyActive();
      else if (command && !event.shiftKey && key === "v") actions.pasteActive();
      else if (command && !event.shiftKey && key === "a") actions.selectAll();
      else if (event.altKey && event.shiftKey && key === "b") actions.toggleSidebar();
      else handled = false;

      if (handled) event.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actions]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"),
  );
}

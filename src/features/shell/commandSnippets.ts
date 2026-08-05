const STORAGE_KEY = "terminus.commandSnippets";
const CHANGE_EVENT = "terminus:command-snippets-changed";

export type CommandSnippet = {
  id: string;
  name: string;
  command: string;
};

export function listCommandSnippets(): CommandSnippet[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is CommandSnippet =>
        Boolean(
          entry &&
          typeof entry === "object" &&
          "id" in entry &&
          typeof entry.id === "string" &&
          "name" in entry &&
          typeof entry.name === "string" &&
          "command" in entry &&
          typeof entry.command === "string",
        ),
    );
  } catch {
    return [];
  }
}

function writeCommandSnippets(snippets: CommandSnippet[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function createCommandSnippet(name: string, command: string): CommandSnippet {
  const snippet = { id: crypto.randomUUID(), name, command };
  writeCommandSnippets([...listCommandSnippets(), snippet]);
  return snippet;
}

export function deleteCommandSnippet(id: string): void {
  writeCommandSnippets(listCommandSnippets().filter((snippet) => snippet.id !== id));
}

export function subscribeCommandSnippets(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

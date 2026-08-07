import { Play, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  createCommandSnippet,
  deleteCommandSnippet,
  listCommandSnippets,
  subscribeCommandSnippets,
} from "./commandSnippets";

export function CommandDrawer({
  focusSearch = false,
  onRun,
}: {
  focusSearch?: boolean;
  onRun: (command: string) => void;
}) {
  const [snippets, setSnippets] = useState(listCommandSnippets);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");

  useEffect(
    () => subscribeCommandSnippets(() => setSnippets(listCommandSnippets())),
    [],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return snippets;
    return snippets.filter(
      (snippet) =>
        snippet.name.toLowerCase().includes(normalized) ||
        snippet.command.toLowerCase().includes(normalized),
    );
  }, [query, snippets]);

  const addSnippet = () => {
    const nextName = name.trim();
    const nextCommand = command.trim();
    if (!nextName || !nextCommand) return;
    createCommandSnippet(nextName, nextCommand);
    setName("");
    setCommand("");
    setAdding(false);
  };

  return (
    <aside aria-label="Commands" className="min-h-screen w-[310px] border-l border-graphite bg-obsidian p-[22px_18px] text-mist">
      <header className="flex items-start justify-between">
        <div>
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.16em] text-acid-lime">
            Productivity
          </p>
          <h2 className="m-0 mt-1 text-[17px] font-w510 text-paper">Commands</h2>
        </div>
        <Button type="button" variant="outline" size="sm" aria-label="Add snippet" onClick={() => setAdding(true)}>
          + Add snippet
        </Button>
      </header>
      <label className="mt-5 flex items-center gap-2 rounded-md border border-graphite bg-carbon px-2.5 text-fog focus-within:border-acid-lime">
        <Search size={15} />
        <span className="sr-only">Search commands</span>
        <Input
          autoFocus={focusSearch}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search commands"
          className="h-9 border-0 bg-transparent px-0 text-mist shadow-none focus-visible:ring-0"
        />
      </label>
      {filtered.length ? (
        <div className="mt-4 grid gap-2">
          {filtered.map((snippet) => (
            <div key={snippet.id} className="rounded-lg border border-graphite bg-carbon p-3">
              <div className="flex items-center justify-between gap-2">
                <strong className="truncate text-[13px] font-medium text-paper">{snippet.name}</strong>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Run ${snippet.name}`}
                    title={`Run ${snippet.name}`}
                    onClick={() => onRun(snippet.command)}
                    className="grid h-7 w-7 place-items-center rounded-md text-acid-lime hover:bg-white/5"
                  >
                    <Play size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${snippet.name}`}
                    title={`Delete ${snippet.name}`}
                    onClick={() => deleteCommandSnippet(snippet.id)}
                    className="grid h-7 w-7 place-items-center rounded-md text-fog hover:bg-white/5 hover:text-coral-red"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <code className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-fog">
                {snippet.command}
              </code>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-24 grid justify-items-center text-center text-fog">
          <Sparkles size={24} />
          <h3 className="m-0 mt-3 mb-1.5 text-[15px] text-paper">
            {snippets.length ? "No matching snippets" : "No snippets yet"}
          </h3>
          <p className="m-0 max-w-[230px] text-xs leading-relaxed">
            {snippets.length
              ? "Try another search."
              : "Save a command here, then run it in the active terminal."}
          </p>
        </div>
      )}
      {adding ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-5" onMouseDown={() => setAdding(false)}>
          <form
            role="dialog"
            aria-label="Add command snippet"
            className="grid w-full max-w-[440px] gap-3 rounded-xl border border-graphite bg-carbon p-5"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              addSnippet();
            }}
          >
            <h3 className="m-0 text-[16px] font-semibold text-paper">Add command snippet</h3>
            <label className="grid gap-1 text-[12px] text-fog">
              Name
              <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="grid gap-1 text-[12px] text-fog">
              Command
              <textarea
                aria-label="Command"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                className="min-h-24 rounded-md border border-graphite bg-obsidian p-2.5 font-mono text-[12px] text-mist outline-none focus:border-acid-lime"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="submit" disabled={!name.trim() || !command.trim()}>Save snippet</Button>
            </div>
          </form>
        </div>
      ) : null}
    </aside>
  );
}

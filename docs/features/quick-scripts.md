# Quick Scripts

Quick Scripts turn a session's already-run commands into one-click cards: type /生成快捷指令 in the SSH AI assistant panel to run, pin, edit, or dismiss them.

## What it does

- `/生成快捷指令` (alias `/quick-script`) in the AI panel is intercepted before it reaches the model and triggers generation from the current session's `ssh_exec` calls. The slash menu is built on assistant-ui's trigger-popover primitives.
- Main process aggregates commands (frequency, success rate, chain-skeleton clustering), asks the configured AI provider to name and describe 1–5 scripts — every script line must match a session command verbatim — and falls back to a fully offline rules mode when no provider is configured, the call fails, or output fails validation.
- Suggestion cards render at the top of the panel: NEW/RULES badges, usage stats, hover actions (run / pin / edit / dismiss), full-script tooltip, shuffle rotation, per-host collapse memory.
- Executing a card writes to the current SSH terminal via one bracketed paste (`runtime.paste(script + "\r")`); risky scripts go through a confirmation dialog driven by the shared shell-risk classifier.
- Scripts are stored per host, AES-GCM encrypted; deleting a host (or vault) cascades.

## How to use

Open an SSH terminal → ⌘I to open the AI panel → run a few AI commands → type `/生成快捷指令`. Click a card to execute it. Settings → AI: toggle "AI generation" (off = offline rules mode) and "Clear all quick script data".

## Where it lives

- Main: `src/main/domains/quickscripts/` (extractor, generator, repository, service, commands)
- IPC: `quickscript_generate|list|update|delete|clear_data` in `src/shared/ipc/command-names.ts`; wire types in `src/shared/ipc/quickscripts/types.ts`
- Renderer: `src/renderer/features/ai/` (`useQuickScripts`, `AiComposer` with assistant-ui slash commands, `QuickScriptsSection`, dialogs, toast) integrated into `AiAssistantPanel`
- Shared risk classifier: `src/shared/shell-risk.ts`

## Security notes

- Session decryption, extraction, and LLM calls stay in the main process; only structured script entries cross IPC (PRD N1).
- `script` fields are AES-GCM encrypted at rest with the app master key (N2).
- LLM input is limited to aggregate command stats plus session title — never the conversation (N3); generation times out at 60s and falls back to rules mode (N4).
- Commands matching secret patterns (AWS keys, PEM headers, long tokens) are dropped and counted, never stored or sent (N8).

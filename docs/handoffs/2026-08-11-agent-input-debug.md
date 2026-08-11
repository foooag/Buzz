# Buzz Agent input debugging handoff

## Repository state

- Branch: `codex/debug-agent-input`
- Snapshot commit: `cd037fc` (`feat(agent): add sidebar workflow and input diagnostics`)
- The snapshot intentionally contains every modified, deleted, and untracked workspace file requested by the user.
- Primary implementation plan: `docs/superpowers/plans/2026-08-05-agent-sidebar.md`
- Product context: `docs/prd/2026-08-05-agent-sidebar.md`
- Working tree was clean immediately after the snapshot commit.

## Current investigation

The Agent composer accepts only the first character when text is entered one physical/discrete key at a time in the user's ordinary browser. The user has now confirmed that text entry through ChatGPT's built-in browser works normally. This is the strongest current discriminator: bulk/direct text insertion works, while the physical keyboard, IME, or per-key event path fails.

Diagnostic routes are committed outside the normal workspace shell:

- `http://127.0.0.1:1420/#/lexical-test`
- `http://127.0.0.1:1420/#/tiptap-test`

Relevant files:

- `src/renderer/features/workspace/LexicalTestPage.tsx`
- `src/renderer/features/workspace/TiptapTestPage.tsx`
- `src/renderer/features/agent/composer/MentionComposer.tsx`
- `src/renderer/features/agent/AgentPage.tsx`

## Confirmed observations

- Opening the renderer at `127.0.0.1:1420` removes Electron main/preload from the input path; the failure can still occur, so Electron is not required for the bug.
- ChatGPT built-in browser text entry and Playwright-style whole-string `type("whoami")` produce the complete text.
- Discrete key input on the Agent Lexical composer, standalone `LexicalComposerInput`, raw Lexical 0.49, and raw Lexical 0.48 retained only the first character in automation reproductions.
- Standalone Tiptap accepted discrete keys normally in the controlled browser. The user's earlier experimental Tiptap replacement inside the Agent composer also failed, but that implementation is no longer present to inspect; editor recreation or controlled-value selection resets remain possible there.
- Moving `LexicalComposerInput` outside `ComposerPrimitive.Root` did not fix it.
- Disabling React StrictMode did not fix it.
- Temporarily upgrading React and React DOM from 19.2.7 to 19.2.8 did not fix it. Versions and files were restored before commit.
- Removing assistant-ui's synchronization layer in a temporary raw Lexical test did not fix the discrete-key automation reproduction, so `SyncPlugin` is not a necessary condition.
- Temporary diagnostic source changes were restored before commit.
- The local `xulux-base-demo` source is not a locked comparison: it has no lockfile or installed dependency tree and uses dependency ranges plus Next.js, so its working behavior does not isolate one package version.

## Best current hypothesis

Focus on the event/selection path that differs between direct text insertion and physical input: macOS input method composition, `keydown` / `beforeinput` / `input` ordering, browser extensions, and DOM Selection after the first mutation. Do not frame this as “Lexical or Tiptap cannot run in Electron.”

First ask the user to compare:

1. macOS `ABC` input source versus their usual IME.
2. An incognito browser window with extensions disabled.
3. Paste of `whoami` versus physical per-key typing.
4. Both committed diagnostic routes, not only the root Agent route.

If code changes are desired, add a temporary visible event recorder to a diagnostic page that captures `keydown`, `beforeinput`, `input`, `keyup`, `compositionstart`, `compositionupdate`, `compositionend`, `isComposing`, `inputType`, `data`, active element, and selection anchor/focus after each event. Compare ordinary-browser physical input with the built-in browser's successful input. Keep the recorder out of production routes or behind a development-only switch.

## Verification already completed

- `pnpm typecheck` passed.
- Full Vitest run passed: 95 files, 317 tests.
- `git diff --check` passed before staging.

## Suggested skills

- `browser:control-in-app-browser`: reproduce both whole-string and discrete-key paths on the local diagnostic routes and inspect visible state.
- `code-review`: review the debug branch against its parent after a concrete fix is implemented.
- `handoff`: regenerate this document if the investigation changes substantially before another session transfer.

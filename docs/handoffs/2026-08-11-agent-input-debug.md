# Buzz Agent input debugging handoff

## Status

Resolved on branch `codex/debug-agent-input`.

The first-character-only input bug was caused by Buzz's Chinese `DocumentTranslator`, not Electron, Lexical, Tiptap, assistant-ui, React, the browser profile, or the input method.

## Root cause

`src/renderer/shared/i18n/index.tsx` observes the whole document in Chinese locale. It cached the first content of every Text node as source text and later restored that value after `characterData` mutations.

For a contenteditable editor, input changed `w` to `wh`, then the translator restored the cached `w`. That DOM write moved Selection back to offset 0 and discarded every character after the first.

## Fix

`translateTree` now ignores user-editable controls and contenteditable subtrees. Ordinary UI text remains translated.

The temporary visible event recorder was removed from the two diagnostic routes because it is no longer needed.

## Regression coverage

- `tests/renderer/shared/i18n.test.tsx` proves editable text is preserved under `zh-CN` while ordinary UI text remains translated.
- `e2e-electron/smoke.spec.ts` forces `zh-CN`, focuses the macOS Electron window, then types `whoami` one key at a time into both Tiptap and Lexical. It asserts the text and Selection offsets after every character.

## Diagnostic routes

- `http://127.0.0.1:1420/#/lexical-test`
- `http://127.0.0.1:1420/#/tiptap-test`

## Detailed investigation

See `docs/debugging/2026-08-11-editor-first-character-input.md`.

## Verification

- `pnpm typecheck` passed.
- Full Vitest passed: 96 files, 319 tests.
- The focused Electron input regression passed under forced `zh-CN`.
- Full Electron E2E ran the input regression successfully; its unrelated desktop-service smoke failed locally with `PTY_OPEN_FAILED` while opening a terminal.

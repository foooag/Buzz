# FORK_REPORT.md — Buzz

Fork of the private **Terminus** repository, prepared for public open-source release as **foooag/Buzz**.

## Source

- Source path: `/Users/gaoooof/Documents/code/tem`
- Target path: `$HOME/opensource-staging/Buzz`
- License: Apache-2.0

## What was copied

307 git-tracked files were copied (no `.git`, no `node_modules`, no build artifacts). Build/artifact directories
(`dist/`, `dist-electron/`, `release/`, `test-results/`) are excluded by `.gitignore`.

## Transformations applied

1. **App rename: Terminus → Buzz**
   - `package.json`: `name`, `author`, `appId` (`dev.buzz.desktop`), `productName`, publish `repo` (`foooag/Buzz`)
   - `index.html` title + description
   - `electron/main.cts` window title
   - AI agent system prompt (`agent-runtime.ts`)
   - User-facing strings: error boundary copy, preferences footer, updater dialog, workspace `aria-label`, i18n keys (en + zh-CN)
   - `app_health` identity string + related tests
   - Docs (`RELEASING.md`, `ELECTRON_ARCHITECTURE.md`, handoffs), `AGENTS.md`
   - Design prototypes (`Terminus.html` → `Buzz.html`, `TerminusApp` → `BuzzApp`, demo paths/labels)
   - `.github/workflows/release.yml` artifact + release names

2. **Excluded directories**
   - `docs/superpowers/` — internal planning/spec/review docs (removed at owner's request)
   - `docs/termius-parity-matrix.md` — competitor-replication comparison (moved aside; recoverable from source)

3. **Secret stripping**
   - No real secrets found. All private-key blocks were UI placeholders; all API-key strings were redacted/`sk-secret` placeholders.
   - Keychain/AAD identity string in `electron/domains/inventory/app-encryption.ts` left **unchanged** deliberately
     (changing it would invalidate existing encrypted vault data).

## Deliberately retained internal identifiers

Renaming these would be high-churn, zero user-visible benefit, and in one case cryptographically unsafe:

- `terminus:*` IPC channel names, `window.terminus` bridge, `TerminusDesktopBridge` type
- `terminus.*` localStorage namespace keys
- `TERMINUS_E2E_DATA_DIR` / `TERMINUS_ISOLATED_E2E` test env vars
- AES-GCM AAD string `Terminus app-local encryption v1` (crypto envelope identity — must not change)

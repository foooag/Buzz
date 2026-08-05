# CLAUDE.md

Buzz is a secure Electron desktop client for local terminals and remote SSH,
SFTP, forwarding, and AI-assisted shell sessions.

## Architecture

- `src/`: React 19 renderer, feature APIs/stores/components, xterm.js UI.
- `electron/main.cts`: desktop lifecycle, sandboxed window, IPC composition.
- `electron/preload.cjs`: minimal renderer bridge.
- `electron/domains/`: TypeScript backend domains for inventory, terminal, SSH,
  forwarding, SFTP, and AI.
- `e2e/`: deterministic browser tests; `e2e-electron/`: real Electron tests.

The renderer never receives Node access. `src/app/ipc.ts` is its only desktop
command seam. Electron validates commands against `electron/command-names.ts`,
then routes them to Zod-validated domain handlers. Wire fields remain camelCase
and results use `{ ok: true, data } | { ok: false, error }`.

The React AI panel is a thin IPC client. `pi-agent-core`, `pi-ai`, Agent state,
context compaction, tool execution, and automatic encrypted history belong to
`electron/domains/ai/`; the Renderer receives only application-owned wire
snapshots and finite-stream events.

## Commands

```bash
pnpm dev
pnpm dev:web
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:electron
pnpm build
pnpm package
```

## Security invariants

- Renderer windows keep `sandbox`, `contextIsolation`, and `webSecurity`
  enabled, with `nodeIntegration` disabled.
- Sensitive inventory fields, SSH credentials, known-host keys, AI API keys,
  and AI history are AES-256-GCM encrypted at rest.
- The 256-bit master key is protected with the app-managed AES-256-GCM key in
  `app-encryption.key`; neither macOS Keychain nor Electron `safeStorage` is used.
- The app encryption key and protected data remain in the Electron user-data
  directory with owner-only file permissions and never cross IPC.
- Provider and transport errors are sanitized. Never log credentials, raw host
  keys, private keys, decrypted vault fields, prompts, or API keys.
- AI shell execution always passes the main-process risk gate. High-risk
  confirmation tokens are short-lived, single-use, and bound to the exact task,
  SSH session, host, CWD, and command hash.
- SSH unknown-host keys require explicit trust; changed keys fail closed.

## Development conventions

Use strict TypeScript, two-space indentation, double quotes, and semicolons.
React components/types use `PascalCase`; functions, hooks, and stores use
`camelCase`. Preserve the `@/` alias and use `cn()` for Tailwind class merging.

Every behavior change needs proportionate tests. Keep deterministic frontend
APIs aligned with real IPC APIs. New commands must be added to the allowlist,
their Electron domain handler, and command-contract tests. Prefer semantic
Testing Library queries and synthetic loopback SSH/provider fixtures.

Design specifications and historical migration plans remain under
`docs/`; current runtime architecture is documented in
`docs/ELECTRON_ARCHITECTURE.md`.

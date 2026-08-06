# Buzz

A secure Electron desktop client for local terminals and remote SSH, SFTP, port
forwarding, and AI-assisted shell sessions.

Buzz keeps your credentials, hosts, known-host keys, AI keys, and AI history
encrypted at rest with AES-256-GCM, runs the renderer fully sandboxed, and gates
every AI shell action behind a risk check in the main process.

## Features

- **Local terminals** — native PTY-backed shell sessions via `node-pty` and `xterm.js`.
- **Remote SSH** — connect to servers with password or private-key auth, encrypted
  credential vault, and explicit unknown-host trust (changed keys fail closed).
- **SFTP** — browse remote file systems, transfer files, resolve conflicts, and open
  files with your system's default apps.
- **Port forwarding** — local/remote forward rules per host with start/stop control.
- **AI-assisted shell** — ask an agent to inspect and operate a session. Every command
  passes a main-process risk gate; high-risk actions require a short-lived, single-use
  confirmation token bound to the exact task, session, host, CWD, and command.
  Works with Anthropic, OpenAI, DeepSeek, Zhipu GLM, and Moonshot Kimi endpoints.
- **Secure at rest** — inventory fields, SSH credentials, known-host keys, AI API keys,
  and AI history are encrypted with AES-256-GCM. The 256-bit master key is protected
  by an app-managed AES-256-GCM key; neither macOS Keychain nor `safeStorage` is used.

## Security model

- Renderer windows keep `sandbox`, `contextIsolation`, and `webSecurity` enabled, with
  `nodeIntegration` disabled.
- The renderer never receives Node access. `src/app/ipc.ts` is its only desktop command
  seam; Electron validates every command against a static allowlist and routes it to a
  Zod-validated domain handler.
- Provider and transport errors are sanitized. Credentials, raw host keys, private keys,
  decrypted vault fields, prompts, and API keys are never logged.
- The encryption key and protected data stay in the Electron user-data directory with
  owner-only file permissions and never cross the IPC boundary.

## Requirements

- Node.js 22+
- pnpm 10+
- Platform support: macOS, Linux, Windows

## Development

```bash
pnpm install
pnpm dev          # start Vite + Electron
pnpm dev:web      # Vite renderer only, http://127.0.0.1:1420
pnpm typecheck    # strict TypeScript
pnpm test         # unit + component tests (Vitest)
pnpm test:e2e     # deterministic browser tests (Playwright)
pnpm test:electron# Electron integration tests
pnpm build        # typecheck + renderer + electron build
pnpm package      # electron-builder installers
```

## Project structure

```
src/               React 19 renderer (features, stores, xterm.js UI)
electron/          Electron main + preload, backend domains
  domains/
    inventory/     encrypted host inventory & vault
    terminal/      local PTY runtime
    ssh/           SSH sessions, credential vault, host-key trust
    sftp/          SFTP runtime & file associations
    forwarding/    port-forward rules
    ai/            AI agent, risk gate, encrypted history
e2e/               deterministic browser tests
e2e-electron/      real Electron tests
docs/              architecture & design docs
```

## Installation

Download the latest installer for your platform from the
[Releases](https://github.com/foooag/Buzz/releases) page. The packaged app checks for
updates automatically on startup.

## Releases

Push a semantic-version tag to build the macOS universal, Windows x64, and
Linux x64 installers and publish them to GitHub Releases:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Prerelease tags such as `v0.1.0-beta.1` are supported. The workflow derives
the packaged application version from the tag, runs the test/build gate once,
and only creates the GitHub Release after every platform package succeeds.

## License

[Apache-2.0](LICENSE)

Built by [foooag](https://github.com/foooag). See [CONTRIBUTING.md](CONTRIBUTING.md)
if you'd like to help.

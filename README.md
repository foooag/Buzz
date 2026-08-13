<div align="center">
  <a href="https://buzz.nex.show">
    <img src="./resources/icons/icon.svg" width="96" height="96" alt="Buzz logo" />
  </a>

  <h1>Buzz</h1>

  <p><strong>Your infrastructure. One secure workspace.</strong></p>

  <p>
    Local terminals, SSH, SFTP, port forwarding, and an AI shell agent<br />
    in one secure, open-source desktop app.
  </p>

  <p>
    <a href="https://buzz.nex.show"><img src="https://img.shields.io/badge/Website-buzz.nex.show-E4F222?style=flat-square&amp;labelColor=08090A" alt="Buzz official website" /></a>
    <a href="https://github.com/foooag/Buzz/actions/workflows/release.yml"><img src="https://github.com/foooag/Buzz/actions/workflows/release.yml/badge.svg" alt="Release build status" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache--2.0-8B8FFF?style=flat-square&amp;labelColor=08090A" alt="Apache 2.0 license" /></a>
    <img src="https://img.shields.io/badge/Platforms-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-D0D6E0?style=flat-square&amp;labelColor=08090A" alt="Supported platforms: macOS, Windows, and Linux" />
  </p>

  <p>
    <a href="./README.md"><strong>English</strong></a>
    ·
    <a href="./README.zh-CN.md"><strong>简体中文</strong></a>
  </p>

  <p>
    <a href="https://buzz.nex.show"><strong>Website</strong></a>
    ·
    <a href="https://github.com/foooag/Buzz/releases"><strong>Download</strong></a>
    ·
    <a href="./CONTRIBUTING.md"><strong>Contributing</strong></a>
  </p>
</div>

<p align="center">
  <img src="./designs/terminal-ai-mode/sftp-preview.png" alt="Buzz secure SFTP workspace preview" />
</p>

## One workspace for local and remote operations

Buzz brings daily shell work and remote infrastructure into a single desktop workspace. Credentials, known-host keys, AI provider keys, inventory fields, and AI history stay encrypted at rest, while every AI-proposed command passes through a risk gate in the Electron main process.

| | Capability | What it gives you |
| --- | --- | --- |
| `01` | **Local terminals** | Native PTY-backed shell sessions powered by `node-pty` and `xterm.js`. |
| `02` | **Remote SSH** | Password or private-key authentication with explicit, fail-closed host-key trust. |
| `03` | **SFTP** | Browse remote files, transfer data, resolve conflicts, and open files locally. |
| `04` | **Port forwarding** | Start and stop local or remote forwarding rules for each host. |
| `05` | **AI shell agent** | Inspect a live session and propose actions through Anthropic, OpenAI, DeepSeek, Zhipu GLM, or Moonshot Kimi endpoints. Replies render streaming Markdown with highlighted code. |
| `06` | **Encrypted vault** | Protect sensitive application data at rest with AES-256-GCM. |

## Ask. Inspect. Act. With a gate in the middle.

The agent can work with the context of a live terminal, but it cannot silently execute a risky action.

| 1 · Agent proposes | 2 · Main process checks | 3 · You stay in control |
| --- | --- | --- |
| Buzz prepares the exact shell command for the active task. | The Electron main process evaluates the command and its execution context. | High-risk actions require a short-lived, single-use approval bound to the task, session, host, working directory, and command. Before you approve, the gate shows the exact command, the agent's plain-language interpretation, and the deterministic risk reason. |

## Security by design

- **Sandboxed renderer** — `sandbox`, `contextIsolation`, and `webSecurity` stay enabled; `nodeIntegration` stays disabled.
- **Typed IPC boundary** — `src/renderer/app/ipc.ts` is the renderer's only desktop command seam. Electron checks a static allowlist and routes commands through Zod-validated domain handlers.
- **Fail-closed host trust** — unknown SSH hosts require explicit approval, while changed host keys stop the connection.
- **Encrypted at rest** — inventory fields, SSH credentials, known-host keys, AI API keys, and AI history use AES-256-GCM encryption.
- **Secrets stay out of the UI** — encryption keys and protected values remain in the Electron user-data directory with owner-only permissions and never cross the IPC boundary.
- **Sanitized failures** — provider and transport errors do not expose credentials, private keys, raw host keys, prompts, decrypted vault fields, or API keys.

The 256-bit vault master key is protected by an app-managed AES-256-GCM key. Buzz does not use macOS Keychain or Electron `safeStorage` for this vault.

## Install Buzz

Download a packaged build from [GitHub Releases](https://github.com/foooag/Buzz/releases), or use the platform links served by the official Buzz download service.

| Platform | Package | Download |
| --- | --- | --- |
| macOS | Universal · DMG / ZIP | [Download for macOS](https://hazel-beta-two.vercel.app/download/darwin) |
| Windows | x64 · NSIS installer | [Download for Windows](https://hazel-beta-two.vercel.app/download/win32) |
| Linux | x64 · AppImage / DEB | [Download for Linux](https://hazel-beta-two.vercel.app/download/linux) |

The packaged application checks for updates automatically on startup.

### Build from source

You will need [Node.js 22+](https://nodejs.org/) and [pnpm 10+](https://pnpm.io/).

```bash
git clone https://github.com/foooag/Buzz.git
cd Buzz
pnpm install
pnpm dev
```

## Development

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start electron-vite (renderer HMR + main/preload rebuild) and launch the desktop app. |
| `pnpm dev:web` | Start only the renderer at `http://127.0.0.1:1420`. |
| `pnpm typecheck` | Validate strict TypeScript (renderer + main/preload) without emitting files. |
| `pnpm test` | Run Vitest unit and component tests. |
| `pnpm test:e2e --project=chromium` | Run Playwright browser scenarios. |
| `pnpm test:electron` | Run the real Electron and preload smoke tests. |
| `pnpm build` | Type-check and build main, preload, and renderer into `out/` via electron-vite. |
| `pnpm package` | Create platform installers with electron-builder. |

## Project structure

```text
Buzz/
├── src/
│   ├── main/            Electron main process (index.ts), domains, and IPC dispatcher
│   │   └── domains/     inventory, terminal, ssh, sftp, forwarding, ai, agent
│   ├── preload/         Sandboxed preload bridge (contextBridge only)
│   ├── renderer/        React 19 renderer, features, stores, and xterm.js UI
│   └── shared/          Cross-process IPC contract (command names, result types)
├── build/               Build tooling (electron-builder hooks, dev watcher)
├── resources/           Packaging icons
├── tests/               Vitest unit and component tests (renderer/, main/)
├── e2e/                 Deterministic Playwright browser tests
├── e2e-electron/        Real Electron integration scenarios
└── docs/                Architecture, design, and release documentation
```

## Releases

Push a semantic-version tag to build macOS universal, Windows x64, and Linux x64 installers and publish them to GitHub Releases:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Prerelease tags such as `v0.1.0-beta.1` are supported. The release workflow derives the application version from the tag, runs the test and build gate, packages every platform, and creates the release only after all platform jobs succeed.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or pull request, and keep behavior changes covered by tests.

## License

Buzz is open source under the [Apache License 2.0](./LICENSE).

<div align="center">
  <sub>Built for the shell. Designed to keep you in control.</sub>
</div>

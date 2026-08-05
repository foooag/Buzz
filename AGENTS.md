# Repository Guidelines

## Project Structure & Module Organization

Buzz is an Electron desktop application. The React/TypeScript renderer lives in `src/`; the isolated Electron main/preload boundary and backend domains live in `electron/`. Backend domains are grouped under `electron/domains/` for inventory, terminal, SSH, forwarding, SFTP, and AI. Vitest tests are colocated as `*.test.ts(x)`; browser Playwright scenarios live in `e2e/`; Electron scenarios live in `e2e-electron/`.

## Build, Test, and Development Commands

- `pnpm install` installs dependencies.
- `pnpm dev` starts Vite and launches Electron.
- `pnpm dev:web` starts only the Vite renderer at `127.0.0.1:1420`.
- `pnpm typecheck` validates TypeScript without emitting files.
- `pnpm test` runs all Vitest unit and component tests.
- `pnpm test:e2e --project=chromium` runs Playwright browser tests.
- `pnpm test:electron` runs the real Electron/preload smoke test.
- `pnpm build` type-checks and builds the renderer and Electron main process.
- `pnpm package` creates platform installers with electron-builder.

## Coding Style & Naming Conventions

Use two-space indentation, double quotes, semicolons, and strict TypeScript. React components and types use `PascalCase`; functions, hooks, and stores use `camelCase`. Group feature files by role, such as `inventoryApi.ts`, `inventoryStore.ts`, and `deterministicInventoryApi.ts`. Preserve the `@/` alias and use `cn()` to merge Tailwind classes.

## Testing Guidelines

Add tests with every behavior change. Prefer Testing Library semantic queries over implementation details. Keep deterministic frontend APIs aligned with real IPC APIs. Desktop commands require domain and command-contract coverage; register new commands in `electron/command-names.ts`, the matching domain handler, and its contract test. No numeric coverage threshold is configured, but affected paths and regressions should be exercised.

## Commit & Pull Request Guidelines

Follow Conventional Commits used in history: `feat(sftp): ...`, `fix(theme): ...`, `test: ...`, or `docs(plan): ...`. Keep commits focused and green. Pull requests should explain the behavior change, link the relevant issue/spec, list verification commands, and include screenshots for UI changes. Call out migrations, IPC contract changes, and security implications explicitly.

## Plan-Mode Visualization

在 plan 模式下产出 specs(`docs/superpowers/specs/`)或 plans(`docs/superpowers/plans/`)时,按下图选型,同一份文档里的同一种图不混用工具。

| 表达目标 | 首选工具 | 写法 |
| --- | --- | --- |
| 逻辑架构 / 服务依赖 / 数据血缘 | Mermaid | ```` ```mermaid ```` 代码块,GitHub/VSCode 原生渲染 |
| 部署架构 / 网络拓扑(含地域、可用区、集群、LB) | PlantUML | ```` ```plantuml ```` 代码块,组件图/部署图表达节点物理位置更清晰 |
| 数据流时序、调用链 | Mermaid sequenceDiagram | 同上 |
| 指标看板、统计分布 | Vega-Lite | ```` ```vega-lite ```` JSON |
| 复杂关系网络、大量节点 | Graphviz | ```` ```dot ```` |
| 自由画布(混合图标/图片/箭头) | drawio | 单独 `.drawio` 文件,Markdown 里用 `![](xxx.drawio.svg)` 嵌入导出后的 SVG |
| 数据流画布 / 端到端 Infographic | Canvas / Infographic | HTML 自包含文件,Markdown 里链接过去 |

约定:
- 代码块必须带语言标注(```` ```mermaid ````、```` ```plantuml ````、```` ```dot ````、```` ```vega-lite ````),否则不渲染。
- Mermaid 中文节点/连线标签里不要出现 `()`、`:`、`()`、`/`,会被解析器吃掉 —— 用书名号或空格替代,或包在 `"..."` 里。
- PlantUML 需要中文字体声明:`skinparam defaultFontName "PingFang SC"` 或 `"Microsoft YaHei"`。
- 同一份文档里同一种图只用一种工具,避免 Mermaid 和 PlantUML 各画一张架构图。

## Security & Configuration

Never log or return vault data, SSH credentials, or API keys. Secrets remain encrypted in Electron main-process services and must not cross the IPC boundary. Keep renderers sandboxed with context isolation and no Node integration. Keep wire fields camelCase and return typed IPC result values.

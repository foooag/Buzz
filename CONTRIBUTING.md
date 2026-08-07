# Contributing to Buzz

Thanks for your interest in contributing! Buzz is a security-sensitive Electron
app, so a few ground rules keep the codebase safe and reviewable.

## Getting started

```bash
./setup.sh          # installs pnpm + dependencies, starts the dev app
pnpm typecheck      # strict TypeScript — must pass
pnpm test           # Vitest unit/component tests
pnpm test:e2e       # deterministic browser tests
pnpm test:electron  # real Electron tests
```

## Reporting issues

Open an issue with the **Bug report** or **Feature request** template. For
security issues, do **not** file a public issue — contact the maintainers
directly and include a repro without credentials.

## Making changes

1. Fork the repository and create a feature branch.
2. Follow the existing conventions:
   - Strict TypeScript, two-space indentation, double quotes, semicolons.
   - `PascalCase` for components/types; `camelCase` for functions/hooks/stores.
   - Use the `@/` import alias and `cn()` for Tailwind class merging.
3. Every behavior change needs proportionate tests. Deterministic frontend APIs
   must stay aligned with real IPC APIs.
4. If you add a new IPC command:
   - add it to `src/shared/ipc/command-names.ts` (the allowlist),
   - implement the Zod-validated handler in the matching `src/main/domains/` domain,
   - add a command-contract test.
5. Run `pnpm typecheck`, `pnpm test`, and the relevant e2e suite before opening
   a PR.
6. In your PR description, explain the *why*: the problem, the change, and how
   you tested it.

## Security notes

- Never log credentials, raw host keys, private keys, decrypted vault fields,
  prompts, or API keys.
- Keep synthetic fixtures synthetic: no real hosts, keys, passwords, or history
  in tests or docs.
- Don't weaken the security invariants in `CLAUDE.md` — sandboxed renderer,
  encrypted at rest, main-process risk gating for AI shell actions.

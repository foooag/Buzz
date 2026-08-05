# Buzz SFTP implementation handoff

## Objective

Continue implementing the approved Termius-compatible Tauri/React desktop application in `/Users/gofancy/Documents/code/tem`. The persistent master objective remains active; do not mark it complete at the end of one protocol milestone.

## Authoritative artifacts

Read these files instead of duplicating their content here:

- Master plan: `/Users/gofancy/Documents/code/tem/docs/superpowers/plans/2026-07-10-termius-tauri-xterm-react.md`
- M3 design: `/Users/gofancy/Documents/code/tem/docs/superpowers/specs/2026-07-11-m3-russh-session-design.md`
- Completed M3 plan: `/Users/gofancy/Documents/code/tem/docs/superpowers/plans/2026-07-11-m3-russh-session-core.md`
- Current parity evidence: `/Users/gofancy/Documents/code/tem/docs/termius-parity-matrix.md`
- Git history through `c41a6ff` for implementation details.

## Current repository state

- M0–M3 SSH Session Core are committed.
- M3 native evidence is complete: packaged macOS UI password flow, SHA-256 TOFU, trusted reconnect without a second prompt, terminal I/O and split, disconnect/restart, changed-key Close-only block, plus macOS Keychain-backed private-key loopback authentication.
- Latest full verification passed: 39 frontend tests, full Rust suite, explicit ignored Keychain integration, four Chromium E2E tests, TypeScript, production build, and all-target Clippy.
- The only worktree modification is user-owned and unrelated: `docs/superpowers/specs/2026-07-10-m0-foundation-design.md`. Preserve it exactly; do not stage, reformat, or commit it.

## New SFTP decisions

The user selected SFTP as the next protocol slice and explicitly approved all of the following scope:

- Full local + remote dual-pane file manager.
- Bidirectional drag-and-drop upload/download.
- Per-conflict dialog with overwrite, skip, rename, and apply-to-all behavior.
- `Open With…`: download a remote file into an app-controlled temporary workspace, open it with a local app, watch for saves, upload changes, and persist file-extension/application associations.

The brainstorming process is in progress. Three architecture options were presented:

1. Independent `russh-sftp` SSH/SFTP session per SFTP tab, reusing existing Keychain, Known Hosts, auth, and errors (recommended).
2. Reuse the interactive terminal SSH connection.
3. Implement SFTP packet handling manually.

The last assistant message asked the user to approve option 1. No approval answer has yet been received. Resume at this exact approval gate; do not implement or write a spec before approval because the brainstorming skill hard gate is active.

## After architecture approval

Continue the required brainstorming checklist one question at a time. Remaining design decisions should cover at least:

- Transfer concurrency and queue semantics.
- Recursive directory operations, symlinks, permissions, hidden files, and large-file behavior.
- Destructive confirmation and partial-failure recovery.
- Temporary-file cleanup and upload-on-save conflict detection.
- Local filesystem authority boundaries and path traversal protection.
- Synthetic SFTP server strategy and native verification.

Then:

1. Present the design in sections and obtain approval.
2. Write and commit `docs/superpowers/specs/2026-07-11-m4-sftp-design.md` (or the current date if the session date changes).
3. Self-review the spec for placeholders, contradictions, ambiguity, and scope.
4. Ask the user to review the written spec.
5. Invoke `writing-plans`; create and commit a detailed checkbox plan.
6. Only after plan approval, use TDD task by task.

## Constraints and cautions

- Rust-native SSH remains mandatory; do not replace `russh` with an external SSH process or libssh2.
- Reuse the existing credential vault and Known Hosts policy. Unknown keys require explicit SHA-256 approval; changed keys are hard-blocked.
- Frontend imports of `@tauri-apps/api` must stay confined to `src/app/ipc.ts`.
- Never log or serialize credentials, private keys, passphrases, raw host keys, arbitrary native paths, or internal errors.
- Test only against synthetic loopback data. Never connect to or reproduce data from the user's real Termius hosts.
- A previous Computer Use inspection surfaced real host metadata in the raw accessibility tree. Do not repeat or record it. Redact reference-app output before displaying it.
- Use `apply_patch` for edits. Check scoped diffs because whole-tree `git diff --check` fails on the preserved user document change.
- Avoid formatting module roots if rustfmt recursively changes unrelated terminal files.

## Suggested skills

- `brainstorming`: mandatory to finish the active SFTP design conversation.
- `writing-plans`: mandatory immediately after the approved and committed SFTP spec.
- `test-driven-development`: mandatory before implementation and bug fixes.
- `computer-use:computer-use`: for carefully redacted Termius comparison and packaged macOS UI verification.
- `browser:control-in-app-browser`: for deterministic browser E2E only, not native transport proof.

## Completion rule

Treat SFTP as the next bounded milestone, not the master objective. After SFTP completes, continue the remaining master-plan protocols and product areas unless the user redirects the work.

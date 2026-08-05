# M4 SFTP File Manager — Completion Handoff

**Date:** 2026-07-12
**Branch:** `feat/m4-sftp`
**Status:** Complete. All five verification commands pass; the branch is ready to merge.

## What landed

M4 added a Termius-compatible dual-pane SFTP file manager over Rust-native
`russh-sftp`, reusing the M3 SSH security boundary. The work is the 17 tasks
in `docs/superpowers/plans/2026-07-12-m4-sftp.md`, delivered as these commits
(oldest first):

1. `c84c8e8` — design doc
2. `7001a59` — implementation plan
3. `164b39c` — russh-sftp spike + synthetic server harness
4. `bcfa204` — locked russh-sftp 2.3.0 API reference
5. `b40d2b0` — shared SSH connect/authenticate/host-key between terminal and SFTP
6. `e8e578c` — final connect/authenticate signatures
7. `84b55e8` — SFTP session manager (open/list/close/reconnect)
8. `f97271d` — SftpSession Clone correction
9. `6df55bc` — path sanitization + destination confinement
10. `c9c5274` — confined local listing + streaming read with staging commit
11. `5ef14af` — transfer and conflict model
12. `76d713d` — recursive expansion + streaming transfer
13. `dafc626` — bounded transfer queue with summary + partial-failure
14. `ad65c4f` — per-conflict resolution with apply-to-all
15. `aa25cf8` — persistent open-with file associations (SQLite)
16. `946bb6a` — open-with workspace with mtime watcher + upload-on-save
17. `a750389` — SFTP IPC commands + registration
18. `b2f9af7` — frontend types, IPC wrapper, deterministic transport
19. `e879ab7` — dual-pane store + panel
20. `c3bc27b` — conflict dialog + transfer list
21. `0fad193` — open-with dialog + associations settings
22. *(Task 17, this commit)* — deterministic E2E, native harness, parity matrix

Capabilities delivered: open host → dual pane; local + remote listing with
show-hidden; bidirectional upload/download; recursive directory transfer with
symlinks skipped and reported; per-conflict dialog (overwrite/skip/rename/
apply-to-all); partial-failure report; transfer progress + cancel; Open-With
download→edit→upload-on-save with size/mtime conflict; file-extension
associations settings; path-traversal protection with staging-file overwrite.

## Verification gate (all green)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | PASS (clean) |
| `pnpm test` | 63 tests, 19 files, all pass |
| `pnpm exec playwright test --project=chromium` | 5 E2E pass (smoke, terminal, inventory, ssh, **sftp**) |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 90 tests pass; 2 ignored (native harnesses) |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | warning-free |

Secret hygiene: `grep -RIn "synthetic-password" src-tauri/src` returns no hits.
The string appears only in test fixtures under `src-tauri/tests/` and in the
ignored native harnesses.

## Locked `russh-sftp 2.3.0` API facts (future work must respect)

These were confirmed in Task 1 and are authoritative for any later SFTP work.
The full reference is in the plan's "Locked russh-sftp 2.3.0 API reference"
section; the load-bearing facts:

- `russh-sftp = "2.1"` resolves to **2.3.0**.
- The server `Handler` trait uses native async fns (no `#[async_trait]`); only
  `fn unimplemented(&self) -> Self::Error` is required.
- All `russh_sftp::protocol::*` structs carry an `id: u32` field. `Status::ok()`
  does **not** exist — build `Status { id, status_code: StatusCode::Ok, ... }`.
- `StatusCode` has no `NoSuchHandle` — use `Failure` for unknown handles.
  `OpenFlags::EXCLUDE` (not `EXCL`).
- `FileAttributes::from(&std::fs::Metadata)` populates size/uid/gid/perms/atime/
  mtime/type. `metadata.mode_opt()` does **not** exist.
- Client `SftpSession` is **not `Clone`** but holds an internal `Arc`; all
  methods take `&self`. The manager wraps it in `Arc<SftpSession>`.
- `read_dir(path)` returns a **synchronous iterator** (`ReadDir`), not an async
  stream. Iterate with `for entry in sftp.read_dir(p).await? { ... }`.
- `sftp.write(path, &[u8])` opens WRITE-only (no CREATE) and fails on missing
  files. Create-or-overwrite uses `sftp.create(path)` then `file.write_all(..)`
  then `await file.flush()` (flush waits for write acks; `Drop` does not flush).
- russh 0.62.2 server wiring: there is **no `Session::channel(id)` accessor**.
  Stash the `Channel<server::Msg>` from `channel_open_session` into an
  `Arc<Mutex<HashMap<ChannelId, Channel<Msg>>>>` and retrieve it in
  `subsystem_request`, then `channel.into_stream()`.
- `ssh::connection::{connect, authenticate}` signatures:
  - `connect(request: ConnectionRequest) -> Result<client::Handle<SharedClientHandler>, AppError>`
  - `authenticate(handle: &client::Handle<SharedClientHandler>, profile: &SshProfile, credential: &SshCredential) -> Result<bool, AppError>` (takes `&Handle`, returns `Ok(false)` for rejected credentials)
  - `ConnectionRequest` has an `inactivity_timeout: Option<Duration>` field;
    SFTP passes `None` (long bulk transfers).

## Explicit remaining differences

These are deliberately not reported as complete:

- **Transfer resume** — partial-file continuation is not implemented.
- **Symlink recreation** — symlinks are skipped and reported, never followed or
  recreated.
- **Hash-based Open-With conflict detection** — size/mtime only, no content hash.
- **Configurable concurrency/bandwidth** — the queue is fixed at concurrency 4
  with a 32 KB streaming buffer; neither is user-tunable.
- **Windows/Linux native Open-With launch** — Open-With launch is macOS only.
- **M3-excluded SSH features** — saved SSH-profile editor, agent authentication,
  keyboard-interactive authentication, jump hosts, and proxy chains remain
  out of scope (carried over from M3).

## How to run the native harness (redacted macOS verification)

The ignored harness starts the in-process synthetic SFTP server for manual
packaged-app UI verification. It never contacts a real host.

```
cargo test --manifest-path src-tauri/Cargo.toml --test native_sftp_server -- --ignored --nocapture
```

Stdout prints:

```
NATIVE_SFTP_PORT=<port>
NATIVE_SFTP_USER=tester
NATIVE_SFTP_PASSWORD=synthetic-password
NATIVE_SFTP_ROOT=<temp root>
```

Override the port with `NATIVE_SFTP_PORT=<port>` (0 = ephemeral). The process
blocks forever; cancel it when done. Point the packaged macOS app at the
printed port with username `tester` and password `synthetic-password`; the
SFTP subsystem serves the printed temp root.

## References

- Spec: `docs/superpowers/specs/2026-07-12-m4-sftp-design.md`
- Plan: `docs/superpowers/plans/2026-07-12-m4-sftp.md`
- Parity matrix: `docs/termius-parity-matrix.md` (M4 SFTP File Manager section)

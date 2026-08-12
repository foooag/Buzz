# Recent-List "Join Live SSH" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a "最近使用" (Recent) sidebar row represents a **connected** live SSH session, clicking it activates (joins) that exact live session instead of navigating to `/history`. Sessions whose live session has ended keep the current "go to /history" fallback.

**Architecture:** Each `HistoryEntry` already carries a `sessionId` that equals the live terminal workspace's tab id — both are stamped with the same UUID in the SSH-open flow (`App.tsx` `onSshOpened` calls `addSession({ id: opened.sessionId })` and `reconnectHistory`/`SshConnectForm` call `markConnectionConnected(historyId, opened.sessionId)`). So "join the live session" reduces to: look up `entry.sessionId` in the terminal store; if a live workspace exists for it, activate it and route to `/terminal`; otherwise fall back to `/history`. Because every SSH connection gets its own UUID and its own history entry, matching by `sessionId` naturally handles the "one server, multiple simultaneous SSH sessions" case — no host-based dedup, no new IPC, no main-process changes.

**Tech Stack:** React + TypeScript, Zustand (`useTerminalStore`), react-router (`useNavigate`), Vitest + Testing Library. Pure renderer change — no Electron main / preload / IPC contract changes.

## Global Constraints

- Two-space indentation, double quotes, semicolons, strict TypeScript (per `AGENTS.md`).
- React components/types PascalCase; hooks/functions/stores camelCase.
- Reuse `useTerminalStore` from `@/features/shell/terminalStore`; do NOT add a parallel store.
- Use `cn()` from `@/lib/utils` only if class merging is genuinely needed; this plan reuses the existing `recentDot()` helper unchanged.
- No new IPC commands, no main-process edits, no new preload surface.
- `pnpm test` runs the renderer Vitest suite; `pnpm typecheck` validates types. Both must stay green.
- Conventional Commits scope: `workspace` (e.g. `feat(workspace): ...`).

## File Structure

- **Modify:** `src/renderer/features/workspace/WorkspaceShell.tsx` — add a new optional prop `onOpenSession(entry: HistoryEntry): void`, change the recent-row `onClick` to call it, keep `/history` as the fallback path (via `useNavigate`).
- **Modify:** `src/renderer/app/App.tsx` — wire `WorkspaceShell`'s new `onOpenSession` prop to a new `openRecentSession` callback that looks up the terminal store by `entry.sessionId`, activates it, and routes to `/terminal`, else routes to `/history`.
- **Create:** `tests/renderer/features/workspace/WorkspaceShell.test.tsx` — extend the existing file (already renders `WorkspaceShell`; reuse the pattern) with a focused test that the recent row calls `onOpenSession` with the matching entry and falls back to `/history` navigation when no handler is supplied.
- **Create:** `tests/renderer/app/App.test.tsx` — add a test exercising the join-live path via the existing `App` with injected fake `api`/`ssh`/`inventory` (matching the `AppProps` seam already used by other tests), plus the fallback to `/history`.

No new production files. No new exports beyond the one prop + one callback. Both edits are additive and leave existing behavior (`navigate("/history")`) intact as the fallback.

---

## Task 1: Extend `WorkspaceShell` with an `onOpenSession` prop

**Files:**
- Modify: `src/renderer/features/workspace/WorkspaceShell.tsx` (props type at lines 29–35; recent-row `<button>` at lines 100–111)
- Test: `tests/renderer/features/workspace/WorkspaceShell.test.tsx` (extend existing file)

**Interfaces:**
- Consumes: `HistoryEntry` type from `@/features/workspace/connectionHistory` (already-imported file; add a named import of the type).
- Produces: a new optional `WorkspaceShellProps.onOpenSession?: (entry: HistoryEntry) => void`. Default `() => undefined`. The recent row calls it on click. When the prop is absent, the row keeps calling `navigate("/history")` (fallback).

- [ ] **Step 1: Write the failing test**

Append to `tests/renderer/features/workspace/WorkspaceShell.test.tsx` (keep the existing `describe` block and its test; add imports and a new test inside the same block). The full file becomes:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { WorkspaceShell } from "@/features/workspace/WorkspaceShell";
import {
  recordConnectionAttempt,
  markConnectionConnected,
} from "@/features/workspace/connectionHistory";

describe("WorkspaceShell", () => {
  it("relies on native window controls instead of rendering a duplicate set", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/servers"]}>
        <WorkspaceShell>
          <div>Workspace content</div>
        </WorkspaceShell>
      </MemoryRouter>,
    );

    expect(container.querySelector("aside > [aria-hidden='true']")).toBeNull();
    expect(screen.getByRole("button", { name: "Preferences" })).toBeVisible();
  });

  it("invokes onOpenSession with the recent entry when a connected row is clicked", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    const historyId = recordConnectionAttempt({
      hostId: "host-1",
      host: "10.0.0.5",
      port: 22,
      username: "deploy",
    });
    markConnectionConnected(historyId, "live-session-1");

    const onOpenSession = vi.fn();
    render(
      <MemoryRouter initialEntries={["/servers"]}>
        <WorkspaceShell onOpenSession={onOpenSession}>
          <div>Workspace content</div>
        </WorkspaceShell>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /10\.0\.0\.5/ }));

    expect(onOpenSession).toHaveBeenCalledTimes(1);
    expect(onOpenSession.mock.calls[0][0]).toMatchObject({
      id: historyId,
      sessionId: "live-session-1",
      host: "10.0.0.5",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- WorkspaceShell.test`
Expected: FAIL — `onOpenSession` is never called (the row still navigates). The new test fails; the pre-existing test still passes.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/features/workspace/WorkspaceShell.tsx`:

(a) Add `HistoryEntry` to the existing import from `"./connectionHistory"` (currently lines 7–12):

```tsx
import {
  formatHistoryWhen,
  listConnectionHistory,
  subscribeConnectionHistory,
  type HistoryEntry,
} from "./connectionHistory";
```

(b) Extend the props type (currently lines 29–35). Add `onOpenSession`:

```tsx
type WorkspaceShellProps = {
  children: ReactNode;
  onSessionActivate?: (sessionId: string) => void;
  onSessionClose?: (sessionId: string) => void;
  onOpenSession?: (entry: HistoryEntry) => void;
  sidebarCompact?: boolean;
  onPreferences?: () => void;
};
```

(c) Destructure the new prop with a no-op default (currently lines 37–43):

```tsx
export function WorkspaceShell({
  children,
  onSessionActivate = () => undefined,
  onSessionClose = () => undefined,
  onOpenSession = () => undefined,
  sidebarCompact = false,
  onPreferences = () => undefined,
}: WorkspaceShellProps) {
```

(d) Change the recent-row `onClick`. Currently (lines 100–111) every recent row navigates to `/history`. Replace the `onClick` so it calls `onOpenSession(entry)`, and let `App` decide join-vs-fallback. The new row:

```tsx
            {history.slice(0, 4).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onOpenSession(entry)}
                className="flex min-w-0 items-center gap-2.5 rounded-[10px] px-3.5 py-1.5 text-left text-[12.5px] text-fog hover:bg-white/5 hover:text-mist"
              >
                <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${recentDot(entry.status)}`} />
                <span className="truncate">{entry.host}</span>
                <span className="ml-auto shrink-0 text-[11px] text-fog/60">{formatHistoryWhen(entry)}</span>
              </button>
            ))}
```

Leave the "Show more" link (lines 91–97) and its `navigate("/history")` unchanged. Leave `recentDot`, the empty-state `<p>`, and the `<section>` structure unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- WorkspaceShell.test`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/workspace/WorkspaceShell.tsx tests/renderer/features/workspace/WorkspaceShell.test.tsx
git commit -m "feat(workspace): route Recent row clicks through onOpenSession"
```

---

## Task 2: Wire `App` to join a live session by `sessionId` (fallback to `/history`)

**Files:**
- Modify: `src/renderer/app/App.tsx` (pass new prop to `<WorkspaceShell>` around line 356; add `openRecentSession` callback near `reconnectHistory`, lines 302–338)
- Test: `tests/renderer/app/App.test.tsx` (extend existing file; add the join-live test)

**Interfaces:**
- Consumes: `WorkspaceShell`'s new `onOpenSession?: (entry: HistoryEntry) => void` prop (Task 1). `HistoryEntry` (already imported at `App.tsx` lines 49–55). `useTerminalStore` selectors already in scope (`sessions` line 134, `activateSession` line 140). `useNavigate` (line 104), `destinationPaths` (line 488).
- Produces: a callback `openRecentSession(entry: HistoryEntry)` inside `RoutedApp`. Behavior:
  - If `entry.status === "connected"` AND `entry.sessionId != null` AND the terminal store has a live workspace `sessions[entry.sessionId]` → `activateSession(entry.sessionId)` then `navigate("/terminal")`.
  - Else → `navigate("/history")` (the pre-Task-1 behavior, preserved).

  The `entry.status === "connected"` gate matches the green dot the user already sees (the row only shows `bg-pulse-green` when `entry.status === "connected"`) and honors the requirement literally; the live-workspace check prevents joining a stale row whose disconnect event hasn't propagated yet.

- [ ] **Step 1: Write the failing test**

Extend `tests/renderer/app/App.test.tsx`. The existing two tests render `<App />` with real/real-ish APIs; for the join-live assertion we need a controlled terminal store + SSH, so we use the `AppProps` seam (`api`, `ssh`, `inventory`). Add imports and a new test. The full file becomes:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import type { TerminalApi } from "@/features/shell/terminalApi";
import type { SshApi } from "@/features/ssh/sshApi";
import type { InventoryApi } from "@/features/inventory/inventoryApi";
import {
  recordConnectionAttempt,
  markConnectionConnected,
} from "@/features/workspace/connectionHistory";
import { useTerminalStore } from "@/features/shell/terminalStore";
import { createPaneNode } from "@/features/shell/terminalTree";

describe("Termius-compatible application shell", () => {
  it("opens on Servers with the observed primary navigation and quick connect", async () => {
    render(<App />);

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Servers" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "SFTP" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Port Forwarding" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Servers" })).toBeVisible();
    const quickConnect = await screen.findByRole("textbox", {
      name: "Find a host or enter an SSH command",
    });
    expect(quickConnect).toHaveAttribute(
      "placeholder",
      "Search servers or connect directly — try “ssh deploy@10.0.0.20”",
    );
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("switches destinations without losing the desktop shell", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: "SFTP" }));

    expect(screen.getByRole("heading", { name: /^SFTP$/ })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(screen.getByRole("link", { name: "SFTP" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("activates the live session and routes to /terminal when a connected Recent row is clicked", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    useTerminalStore.setState({
      sessions: {},
      sessionOrder: [],
      activeSessionId: null,
    });

    const api: TerminalApi = {
      open: vi.fn().mockResolvedValue({ sessionId: "ssh-1", title: "deploy@host" }),
      close: vi.fn().mockResolvedValue(undefined),
      write: vi.fn(),
      resize: vi.fn(),
    } as unknown as TerminalApi;
    const ssh: SshApi = {
      open: vi.fn().mockResolvedValue({ sessionId: "ssh-1", title: "deploy@host" }),
      reconnect: vi.fn(),
    } as unknown as SshApi;
    const inventory: InventoryApi = {
      listHosts: vi.fn().mockResolvedValue([]),
    } as unknown as InventoryApi;

    // Seed a live workspace whose id equals the history entry's sessionId,
    // mirroring the real SSH-open flow (onSshOpened + markConnectionConnected).
    const paneId = "pane-ssh-1";
    useTerminalStore.getState().addSession({
      id: "ssh-1",
      title: "deploy@10.0.0.5",
      status: "connected",
      root: createPaneNode(paneId, "ssh-1"),
      activePaneId: paneId,
    });
    const historyId = recordConnectionAttempt({
      hostId: "host-1",
      host: "10.0.0.5",
      port: 22,
      username: "deploy",
    });
    markConnectionConnected(historyId, "ssh-1");

    render(<App api={api} ssh={ssh} inventory={inventory} />);

    await user.click(screen.getByRole("button", { name: /10\.0\.0\.5/ }));

    expect(useTerminalStore.getState().activeSessionId).toBe("ssh-1");
    expect(window.location.hash).toContain("/terminal");
  });
});
```

Note: this test seeds the **real** `useTerminalStore` (a module-level singleton) and the real `connectionHistory` localStorage. The `App` under test uses the same singletons, so the join must be observable without further mocking.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- App.test`
Expected: FAIL — after the click the route is `/history`, not `/terminal`, and `activeSessionId` is unchanged (no `openRecentSession` wiring yet). The two pre-existing tests still pass.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/app/App.tsx`:

(a) Add the `openRecentSession` callback. Place it immediately after `reconnectHistory` (after line 338, before `restartSession` at line 340):

```tsx
  const openRecentSession = useCallback(
    (entry: HistoryEntry) => {
      const sessionId = entry.sessionId;
      const live =
        entry.status === "connected" &&
        sessionId != null &&
        Boolean(useTerminalStore.getState().sessions[sessionId]);
      if (live) {
        activateSession(sessionId!);
        navigate(destinationPaths.terminal);
      } else {
        navigate(destinationPaths.history);
      }
    },
    [activateSession, navigate],
  );
```

`activateSession` (selected at line 140) already guards against missing ids in the store (`terminalStore.ts:63-65`), but the explicit `live` check is what distinguishes join-vs-fallback and what we assert on. `destinationPaths.terminal` and `destinationPaths.history` are already defined (lines 488–497). `HistoryEntry` is already imported (lines 49–55).

(b) Pass the new prop to `<WorkspaceShell>` (currently lines 356–364). Add the `onOpenSession` line:

```tsx
      <WorkspaceShell
        onSessionActivate={(sessionId) => {
          activateSession(sessionId);
          setDestination("terminal");
        }}
        onSessionClose={(sessionId) => void closeWorkspace(sessionId)}
        onOpenSession={openRecentSession}
        sidebarCompact={sidebarCompact}
        onPreferences={() => setPreferencesOpen(true)}
      >
```

No other changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- App.test`
Expected: PASS — all three tests green; after the click `activeSessionId === "ssh-1"` and the hash contains `/terminal`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app/App.tsx tests/renderer/app/App.test.tsx
git commit -m "feat(workspace): join live SSH session from Recent sidebar row"
```

---

## Task 3: Verify fallback, typecheck, and full suite

**Files:**
- None modified; this task is verification-only and adds one regression test for the fallback branch.

**Interfaces:**
- Consumes: Task 1 + Task 2 deliverables.

- [ ] **Step 1: Write the failing-ish regression test for the fallback branch**

Append a fourth test to `tests/renderer/app/App.test.tsx` (inside the same `describe`). It asserts that a Recent row whose `sessionId` is no longer in the live store routes to `/history` (the pre-feature behavior, preserved as fallback):

```tsx
  it("falls back to /history when the Recent row has no live session", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    useTerminalStore.setState({
      sessions: {},
      sessionOrder: [],
      activeSessionId: null,
    });

    const api: TerminalApi = {
      open: vi.fn().mockResolvedValue({ sessionId: "gone", title: "deploy@host" }),
      close: vi.fn().mockResolvedValue(undefined),
      write: vi.fn(),
      resize: vi.fn(),
    } as unknown as TerminalApi;
    const ssh: SshApi = {
      open: vi.fn().mockResolvedValue({ sessionId: "gone", title: "deploy@host" }),
      reconnect: vi.fn(),
    } as unknown as SshApi;
    const inventory: InventoryApi = {
      listHosts: vi.fn().mockResolvedValue([]),
    } as unknown as InventoryApi;

    // History entry with a sessionId that is NOT present as a live workspace.
    const historyId = recordConnectionAttempt({
      hostId: "host-2",
      host: "10.0.0.9",
      port: 22,
      username: "deploy",
    });
    markConnectionConnected(historyId, "gone");

    render(<App api={api} ssh={ssh} inventory={inventory} />);

    await user.click(screen.getByRole("button", { name: /10\.0\.0\.9/ }));

    expect(window.location.hash).toContain("/history");
    expect(useTerminalStore.getState().activeSessionId).not.toBe("gone");
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test -- App.test`
Expected: PASS — fallback branch already implemented in Task 2 Step 3; this test pins it.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors. Confirms the new `HistoryEntry` import in `WorkspaceShell.tsx`, the new optional prop, and the `openRecentSession` types are sound.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all Vitest unit/component tests green (including the two pre-existing baseline-failure Playwright e2e tests are NOT in this suite; `pnpm test` is Vitest only). If anything regresses, fix before committing.

- [ ] **Step 5: Commit**

```bash
git add tests/renderer/app/App.test.tsx
git commit -m "test(workspace): pin Recent-row fallback to /history for ended sessions"
```

---

## Out of scope (explicit non-goals)

- Changing the full `HistoryPage` (`ResourcePages.tsx`) Reconnect button — it already creates a fresh connection intentionally; leaving it.
- Deduplicating multiple SSH sessions per host — by design each connection is its own UUID + history row; "join by sessionId" already disambiguates them.
- Any Electron main-process, preload, or IPC-contract change — none needed; `entry.sessionId` and the terminal store already hold everything required.
- i18n — no user-visible strings change ("Recent" / "最近使用" labels and statuses are untouched).

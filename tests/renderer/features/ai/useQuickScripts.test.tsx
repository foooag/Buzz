import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuickScript } from "@shared/ipc/quickscripts/types";
import { createDeterministicQuickScriptApi } from "@/features/ai/deterministicQuickScriptApi";
import { useQuickScripts } from "@/features/ai/useQuickScripts";

const qs = (id: string, overrides: Partial<QuickScript> = {}): QuickScript => ({
  id, hostId: "host-1", sessionId: "s", title: `T${id}`, script: `cmd-${id}`,
  description: null, sourceUsageCount: 2, sourceSuccessCount: 2, executedCount: 0,
  confidence: 0.9, riskHint: null, status: "suggested", isNew: false, mode: "llm",
  createdAt: "", updatedAt: "", ...overrides,
});

function makeApi(rows: QuickScript[] = []) {
  const base = createDeterministicQuickScriptApi(rows);
  // The deterministic api mutates the row objects it returns from list().
  // Return fresh shallow copies so the hook's state is not aliased to the
  // api's internal store (mirrors a real IPC api, whose list reads are copies).
  const api: ReturnType<typeof createDeterministicQuickScriptApi> = {
    ...base,
    list: async (hostId, includeDismissed) =>
      (await base.list(hostId, includeDismissed)).map((row) => ({ ...row })),
  };
  return { api, spies: { update: vi.spyOn(api, "update"), list: vi.spyOn(api, "list") } };
}

// Flush pending microtasks (async api calls) and commit React state inside act.
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

async function mount(overrides: Partial<Parameters<typeof useQuickScripts>[0]> = {}) {
  const { api, spies } = makeApi([qs("1"), qs("2"), qs("3"), qs("4")]);
  const onRunCommand = vi.fn();
  const hook = renderHook(() =>
    useQuickScripts({ sshSessionId: "ssh-1", hostId: "host-1", api, onRunCommand, ...overrides }),
  );
  // The mount effect loads scripts asynchronously; flush and commit the load.
  await flush();
  return { hook, api, spies, onRunCommand };
}

beforeEach(() => localStorage.clear());

describe("useQuickScripts", () => {
  it("loads on mount, sorts pinned→confidence, and windows 3 cards", async () => {
    const { hook } = await mount();
    expect(hook.result.current.poolCount).toBe(4);
    expect(hook.result.current.visible.length).toBe(3);
    expect(hook.result.current.hasMore).toBe(true);
  });

  it("shuffle rotates the visible window", async () => {
    const { hook } = await mount();
    const before = hook.result.current.visible.map((s) => s.id);
    act(() => hook.result.current.shuffle());
    expect(hook.result.current.visible.map((s) => s.id)).not.toEqual(before);
  });

  it("generate runs the phase machine working→done and refreshes", async () => {
    const { hook } = await mount();
    act(() => { void hook.result.current.generate(); });
    expect(hook.result.current.phase).toBe("working");
    await flush();
    expect(hook.result.current.phase).toBe("done");
    expect(hook.result.current.generatedCount).toBe(2);
  });

  it("execute pastes safe scripts, bumps executedCount, and clears isNew", async () => {
    const { hook, spies } = await mount();
    await act(async () => { hook.result.current.execute(hook.result.current.visible[0]); });
    expect(hook.result.current.pendingConfirm).toBeNull();
    expect(hook.result.current.visible[0].executedCount).toBe(1);
    expect(hook.result.current.visible[0].isNew).toBe(false);
    expect(hook.result.current.visible[0].title).toBe("T1");
    expect(spies.update).toHaveBeenCalled();
  });

  it("execute routes risky scripts through the confirm dialog", async () => {
    const { hook, onRunCommand } = await mount();
    const risky = qs("r", { script: "sudo systemctl restart nginx", riskHint: "restarts nginx" });
    act(() => hook.result.current.execute(risky));
    expect(hook.result.current.pendingConfirm?.id).toBe("r");
    expect(onRunCommand).not.toHaveBeenCalled();
    act(() => hook.result.current.resolveConfirm("run"));
    expect(onRunCommand).toHaveBeenCalledWith("sudo systemctl restart nginx");
    expect(hook.result.current.pendingConfirm).toBeNull();
    act(() => hook.result.current.execute(risky));
    act(() => hook.result.current.resolveConfirm("cancel"));
    expect(onRunCommand).toHaveBeenCalledTimes(1);
  });

  it("dismiss hides, offers undo, and restore works", async () => {
    const { hook } = await mount();
    act(() => hook.result.current.dismiss("1"));
    expect(hook.result.current.poolCount).toBe(3);
    expect(hook.result.current.undo?.kind).toBe("dismiss");
    act(() => hook.result.current.undoLast());
    expect(hook.result.current.poolCount).toBe(4);
  });

  it("collapse persists per host in localStorage", async () => {
    const { hook } = await mount();
    act(() => hook.result.current.toggleCollapse());
    expect(localStorage.getItem("terminus.quickScripts.collapsed.host-1")).toBe("1");
    act(() => hook.result.current.toggleCollapse());
    expect(localStorage.getItem("terminus.quickScripts.collapsed.host-1")).toBe("0");
  });
});

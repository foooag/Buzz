import { describe, expect, it } from "vitest";
import type { QuickScriptApi } from "@/features/ai/quickScriptApi";
import { createDeterministicQuickScriptApi } from "@/features/ai/deterministicQuickScriptApi";

function script(id: string, overrides: Partial<QuickScriptApi extends never ? never : Awaited<ReturnType<QuickScriptApi["list"]>>[number]> = {}) {
  return {
    id,
    hostId: "host-1",
    sessionId: "session-1",
    title: "Check nginx errors",
    script: "tail -n 30 /var/log/nginx/error.log",
    description: "Read the latest nginx errors.",
    sourceUsageCount: 5,
    sourceSuccessCount: 5,
    executedCount: 0,
    confidence: 0.94,
    riskHint: null,
    status: "suggested" as const,
    isNew: true,
    mode: "llm" as const,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("createDeterministicQuickScriptApi", () => {
  it("lists seeded scripts sorted pinned-first then confidence", async () => {
    const api = createDeterministicQuickScriptApi([
      script("b", { confidence: 0.5 }),
      script("a", { status: "pinned", confidence: 0.1 }),
    ]);
    const listed = await api.list("host-1");
    expect(listed.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("generate seeds two llm scripts and reports createdCount", async () => {
    const api = createDeterministicQuickScriptApi([]);
    const result = await api.generate({ sshSessionId: "ssh-1" });
    expect(result.mode).toBe("llm");
    expect(result.createdCount).toBe(2);
    expect(result.hostId).toBe("host-deterministic");
    expect((await api.list("host-deterministic")).length).toBe(2);
  });

  it("update patches fields and delete removes the row", async () => {
    const api = createDeterministicQuickScriptApi([script("a")]);
    const updated = await api.update("a", { status: "pinned", executedCount: 3 });
    expect(updated.status).toBe("pinned");
    expect(updated.executedCount).toBe(3);
    expect(updated.isNew).toBe(false);
    await api.delete("a");
    expect(await api.list("host-1")).toEqual([]);
  });

  it("clearData wipes everything", async () => {
    const api = createDeterministicQuickScriptApi([script("a")]);
    await api.clearData();
    expect(await api.list("host-1")).toEqual([]);
  });
});

import type {
  QuickScript,
  QuickScriptGenerationResult,
  QuickScriptPatch,
} from "@shared/ipc/quickscripts/types";

export type QuickScriptApi = {
  generate(input: { sshSessionId: string; useLlm?: boolean }): Promise<QuickScriptGenerationResult>;
  list(hostId: string, includeDismissed?: boolean): Promise<QuickScript[]>;
  update(id: string, patch: QuickScriptPatch): Promise<QuickScript>;
  delete(id: string): Promise<void>;
  clearData(hostId?: string): Promise<void>;
};

export function createDeterministicQuickScriptApi(initial: QuickScript[] = []): QuickScriptApi {
  let seq = 0;
  const stamp = () => new Date(1_700_000_000_000 + seq * 1_000).toISOString();
  const rows = initial.map((row) => ({ ...row }));
  const sortRows = () =>
    [...rows]
      .filter((row) => row.status !== "dismissed")
      .sort(
        (a, b) =>
          (a.status === "pinned" ? 0 : 1) - (b.status === "pinned" ? 0 : 1) ||
          b.confidence - a.confidence ||
          b.executedCount - a.executedCount,
      );
  return {
    async generate({ sshSessionId }) {
      const base = {
        hostId: "host-deterministic",
        sessionId: sshSessionId,
        description: "Deterministic demo script.",
        sourceUsageCount: 3,
        sourceSuccessCount: 3,
        executedCount: 0,
        riskHint: null,
        status: "suggested" as const,
        isNew: true,
        mode: "llm" as const,
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      rows.push({ ...base, id: `qs-${++seq}`, title: "List services", script: "systemctl list-units --type=service", confidence: 0.9 });
      rows.push({ ...base, id: `qs-${++seq}`, title: "Disk usage", script: "df -h", confidence: 0.85 });
      return { hostId: "host-deterministic", createdCount: 2, mode: "llm", durationMs: 12, droppedCount: 0 };
    },
    // The fixture keeps one in-memory pool regardless of hostId: the real
    // backend resolves the host from the sshSessionId at generate time, so a
    // list() scoped by the panel's resolved host must still surface the rows
    // the fixture generated. Existing tests seed/list with a single host, so
    // ignoring the filter changes nothing for them.
    async list() {
      return sortRows();
    },
    async update(id, patch) {
      const row = rows.find((entry) => entry.id === id);
      if (!row) throw new Error(`Quick script ${id} not found`);
      Object.assign(row, patch, { updatedAt: stamp() });
      if (patch.executedCount !== undefined || patch.status !== undefined) row.isNew = false;
      return { ...row };
    },
    async delete(id) {
      const index = rows.findIndex((entry) => entry.id === id);
      if (index >= 0) rows.splice(index, 1);
    },
    async clearData() {
      rows.length = 0;
    },
  };
}

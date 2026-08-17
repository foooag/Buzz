import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classify } from "@shared/shell-risk";
import type { QuickScript, QuickScriptStatus } from "@shared/ipc/quickscripts/types";
import type { QuickScriptGenPhase } from "./QuickScriptsSection";
import type { QuickScriptApi } from "./deterministicQuickScriptApi";

export const QUICK_SLASH_TRIGGERS = ["/生成快捷指令", "/quick-script"] as const;

export const QUICK_SLASH_COMMANDS = [
  { token: "/生成快捷指令", hint: "Recap this session · generate quick scripts" },
] as const;

const DONE_RESET_MS = 4_800;
const UNDO_TTL_MS = 5_200;
const WINDOW_SIZE = 3;

export type QuickScriptUndo = {
  kind: "dismiss" | "delete";
  qs: QuickScript;
  prevStatus?: QuickScriptStatus;
};

export function useQuickScripts({
  sshSessionId,
  hostId,
  api,
  onRunCommand,
}: {
  sshSessionId?: string;
  hostId?: string;
  api: QuickScriptApi;
  onRunCommand?: (command: string) => void;
}) {
  const [scripts, setScripts] = useState<QuickScript[]>([]);
  const [phase, setPhase] = useState<QuickScriptGenPhase>("idle");
  const [generatedCount, setGeneratedCount] = useState(0);
  const [collapsedKey, setCollapsedKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [offset, setOffset] = useState(0);
  const [undo, setUndo] = useState<QuickScriptUndo | null>(null);
  const [editing, setEditing] = useState<QuickScript | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<QuickScript | null>(null);
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; }, [api]);

  const collapsedStorageKey = hostId ? `terminus.quickScripts.collapsed.${hostId}` : null;

  // 挂载 / 主机切换时加载;重置轮换与生成反馈。
  useEffect(() => {
    if (!hostId) {
      setScripts([]);
      setPhase("idle");
      return;
    }
    let cancelled = false;
    void apiRef.current.list(hostId).then((rows) => {
      if (!cancelled) setScripts(rows);
    }).catch(() => {
      if (!cancelled) setScripts([]);
    });
    setCollapsed(collapsedStorageKey ? localStorage.getItem(collapsedStorageKey) === "1" : false);
    setCollapsedKey(collapsedStorageKey);
    setOffset(0);
    setPhase("idle");
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  useEffect(() => {
    if (!collapsedKey) return;
    localStorage.setItem(collapsedKey, collapsed ? "1" : "0");
  }, [collapsed, collapsedKey]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_TTL_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const refresh = useCallback(async () => {
    if (!hostId) return;
    try {
      setScripts(await apiRef.current.list(hostId));
    } catch {
      /* 保持当前列表 */
    }
  }, [hostId]);

  const generate = useCallback(async () => {
    if (!sshSessionId || phase === "working") return;
    setPhase("working");
    setCollapsed(false);
    try {
      const result = await apiRef.current.generate({ sshSessionId });
      if (result.mode === "empty") {
        setPhase("empty");
        return;
      }
      await refresh();
      setGeneratedCount(result.createdCount);
      setPhase("done");
      setTimeout(() => setPhase((current) => (current === "done" ? "idle" : current)), DONE_RESET_MS);
    } catch {
      setPhase("failed");
    }
  }, [sshSessionId, phase, refresh]);

  const run = useCallback((qs: QuickScript) => {
    onRunCommand?.(qs.script);
    setScripts((prev) =>
      prev.map((row) => (row.id === qs.id ? { ...row, executedCount: row.executedCount + 1, isNew: false } : row)),
    );
    void apiRef.current.update(qs.id, { executedCount: qs.executedCount + 1 }).catch(() => undefined);
  }, [onRunCommand]);

  const execute = useCallback((qs: QuickScript) => {
    const verdict = classify(qs.script);
    if (verdict.kind === "allow") run(qs);
    else setPendingConfirm(qs);
  }, [run]);

  const resolveConfirm = useCallback((decision: "run" | "cancel") => {
    const qs = pendingConfirm;
    setPendingConfirm(null);
    if (decision === "run" && qs) run(qs);
  }, [pendingConfirm, run]);

  const pin = useCallback((id: string) => {
    const target = scripts.find((row) => row.id === id);
    if (!target) return;
    const nextStatus = target.status === "pinned" ? "suggested" : "pinned";
    setScripts((prev) =>
      prev.map((row) => (row.id === id ? { ...row, status: nextStatus } : row)),
    );
    void apiRef.current.update(id, { status: nextStatus }).catch(() => undefined);
  }, [scripts]);

  const dismiss = useCallback((id: string) => {
    const qs = scripts.find((row) => row.id === id);
    if (!qs) return;
    setScripts((prev) => prev.filter((row) => row.id !== id));
    setUndo({ kind: "dismiss", qs, prevStatus: qs.status });
    void apiRef.current.update(id, { status: "dismissed" }).catch(() => undefined);
  }, [scripts]);

  const remove = useCallback((id: string) => {
    const qs = scripts.find((row) => row.id === id);
    if (!qs) return;
    setScripts((prev) => prev.filter((row) => row.id !== id));
    setEditing(null);
    setUndo({ kind: "delete", qs });
    void apiRef.current.delete(id).catch(() => undefined);
  }, [scripts]);

  const saveEdit = useCallback((id: string, draft: { title: string; script: string }) => {
    setScripts((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, title: draft.title.trim() || row.title, script: draft.script, updatedAt: new Date().toISOString() }
          : row,
      ),
    );
    setEditing(null);
    void apiRef.current.update(id, draft).catch(() => undefined);
  }, []);

  const undoLast = useCallback(() => {
    const entry = undo;
    if (!entry) return;
    if (entry.kind === "delete") {
      setScripts((prev) => [...prev, entry.qs]);
      void refresh(); // 存储中的记录已删,撤销仅在本地恢复本次面板会话
    } else {
      setScripts((prev) => [...prev, { ...entry.qs, status: entry.prevStatus ?? "suggested" }]);
      void apiRef.current.update(entry.qs.id, { status: entry.prevStatus ?? "suggested" }).catch(() => undefined);
    }
    setUndo(null);
  }, [undo, refresh]);

  const sorted = useMemo(
    () =>
      [...scripts].sort(
        (a, b) =>
          (a.status === "pinned" ? 0 : 1) - (b.status === "pinned" ? 0 : 1) ||
          b.confidence - a.confidence ||
          b.executedCount - a.executedCount,
      ),
    [scripts],
  );
  const visible = useMemo(
    () =>
      sorted.length <= WINDOW_SIZE
        ? sorted
        : Array.from({ length: WINDOW_SIZE }, (_, i) => sorted[(offset + i) % sorted.length]),
    [sorted, offset],
  );
  const shuffle = useCallback(() => {
    setOffset((current) => (sorted.length > WINDOW_SIZE ? (current + WINDOW_SIZE) % sorted.length : 0));
  }, [sorted.length]);

  return {
    scripts, visible, poolCount: sorted.length, hasMore: sorted.length > WINDOW_SIZE,
    phase, generatedCount, collapsed,
    toggleCollapse: () => setCollapsed((value) => !value),
    shuffle, generate, execute, pendingConfirm, resolveConfirm,
    pin, dismiss, remove, saveEdit, editing, setEditing,
    undo, undoLast, refresh,
  };
}

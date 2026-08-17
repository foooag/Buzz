import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuickScriptsSection } from "@/features/ai/QuickScriptsSection";
import type { QuickScript } from "@shared/ipc/quickscripts/types";

const qs = (id: string, overrides: Partial<QuickScript> = {}): QuickScript => ({
  id,
  hostId: "host-1",
  sessionId: "session-1",
  title: "Read nginx errors",
  script: "tail -n 30 /var/log/nginx/error.log",
  description: "Latest 30 error lines.",
  sourceUsageCount: 5,
  sourceSuccessCount: 5,
  executedCount: 0,
  confidence: 0.94,
  riskHint: null,
  status: "suggested",
  isNew: true,
  mode: "llm",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
  ...overrides,
});

describe("QuickScriptCard", () => {
  it("renders badges, stats pill, and calls execute on click", async () => {
    const onExecute = vi.fn();
    render(<QuickScriptsSection
      hostName="web-prod-01" visible={[qs("a", { executedCount: 3 })]} poolCount={1}
      phase="idle" generatedCount={0} collapsed={false}
      onToggleCollapse={() => undefined} onShuffle={() => undefined}
      onExecute={onExecute} onPin={vi.fn()} onEdit={vi.fn()} onDismiss={vi.fn()}
    />);
    const card = screen.getByRole("button", { name: "Quick script Read nginx errors" });
    expect(screen.getByText("NEW")).toBeVisible();
    expect(screen.getByText("5x · 100%")).toBeVisible();
    await userEvent.click(card);
    expect(onExecute).toHaveBeenCalledTimes(1);
  });

  it("shows risk icon, rules badge, and extra-line marker", () => {
    render(<QuickScriptsSection
      hostName="h" visible={[qs("a", { mode: "rules", riskHint: "restarts gunicorn", script: "sudo systemctl restart gunicorn\ncurl localhost/health" })]}
      poolCount={1} phase="idle" generatedCount={0} collapsed={false}
      onToggleCollapse={() => undefined} onShuffle={() => undefined}
      onExecute={vi.fn()} onPin={vi.fn()} onEdit={vi.fn()} onDismiss={vi.fn()}
    />);
    expect(screen.getByText("RULES")).toBeVisible();
    expect(screen.getByText(/⏎\+1/)).toBeVisible();
    expect(screen.getByLabelText(/risk hint/i)).toBeVisible();
  });

  it("keyboard Enter triggers execute and hover actions stop propagation", () => {
    const onExecute = vi.fn();
    const onDismiss = vi.fn();
    render(<QuickScriptsSection
      hostName="h" visible={[qs("a")]} poolCount={1} phase="idle" generatedCount={0} collapsed={false}
      onToggleCollapse={() => undefined} onShuffle={() => undefined}
      onExecute={onExecute} onPin={vi.fn()} onEdit={vi.fn()} onDismiss={onDismiss}
    />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Quick script Read nginx errors" }), { key: "Enter" });
    expect(onExecute).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Read nginx errors" }));
    expect(onDismiss).toHaveBeenCalledWith("a");
    expect(onExecute).toHaveBeenCalledTimes(1);
  });
});

describe("QuickScriptsSection header states", () => {
  const base = {
    hostName: "web-prod-01", visible: [], poolCount: 0, generatedCount: 2,
    onToggleCollapse: vi.fn(), onShuffle: vi.fn(), onExecute: vi.fn(), onPin: vi.fn(),
    onEdit: vi.fn(), onDismiss: vi.fn(),
  };

  it("working state shows the recap spinner text", () => {
    render(<QuickScriptsSection {...base} phase="working" collapsed={false} />);
    expect(screen.getByText("Recapping this session…")).toBeVisible();
  });

  it("done state shows generated count", () => {
    render(<QuickScriptsSection {...base} phase="done" collapsed={false} />);
    expect(screen.getByText(/Generated 2 scripts/)).toBeVisible();
  });

  it("done state with zero created says up to date", () => {
    render(<QuickScriptsSection {...base} phase="done" generatedCount={0} collapsed={false} />);
    expect(screen.getByText("Scripts are up to date")).toBeVisible();
  });

  it("failed state announces rules fallback", () => {
    render(<QuickScriptsSection {...base} phase="failed" collapsed={false} />);
    expect(screen.getByText(/Generation failed/)).toBeVisible();
  });

  it("empty state hints at /生成快捷指令", () => {
    render(<QuickScriptsSection {...base} phase="empty" collapsed={false} />);
    expect(screen.getByText(/no commands in this session yet/i)).toBeVisible();
    expect(screen.getByText("/生成快捷指令")).toBeVisible();
  });

  it("collapsed shows count pill, hides cards, and shuffle only appears with pool > 3", () => {
    const { rerender } = render(<QuickScriptsSection {...base} phase="idle" collapsed poolCount={5} />);
    expect(screen.getByText("5 scripts")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Shuffle/i })).toBeNull();
    rerender(<QuickScriptsSection {...base} phase="idle" collapsed={false} poolCount={5} />);
    expect(screen.getByRole("button", { name: /Shuffle/i })).toBeVisible();
    rerender(<QuickScriptsSection {...base} phase="idle" collapsed={false} poolCount={2} />);
    expect(screen.queryByRole("button", { name: /Shuffle/i })).toBeNull();
  });
});

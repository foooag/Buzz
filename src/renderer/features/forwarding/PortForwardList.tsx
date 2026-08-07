import {
  Loader2,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CreateSshProfile } from "../ssh/sshTypes";
import { PortForwardForm } from "./PortForwardForm";
import type { ForwardingApi } from "./forwardingApi";
import { createForwardingStore } from "./forwardingStore";
import type {
  PortForwardRule,
  PortForwardRuleInput,
} from "./forwardingTypes";

const kindLabel: Record<PortForwardRule["kind"], string> = {
  local: "Local",
  remote: "Remote",
  dynamic: "Dynamic (SOCKS5)",
};

function describeTarget(rule: PortForwardRule): string {
  if (rule.kind === "dynamic") return "SOCKS5";
  return `${rule.targetHost ?? ""}:${rule.targetPort ?? ""}`;
}

export function PortForwardList({
  hostId,
  profile,
  api,
}: {
  hostId: string;
  profile: CreateSshProfile;
  api: ForwardingApi;
}) {
  const store = useMemo(() => createForwardingStore(api), [api]);
  const [rules, setRules] = useState<PortForwardRule[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PortForwardRule | undefined>();

  useEffect(() => {
    const unsubscribe = store.subscribe((state) => {
      setRules(state.rulesByHostId[hostId] ?? []);
      setActiveIds(state.activeIds);
    });
    void store.getState().loadRules(hostId);
    void store.getState().refreshActive();
    return unsubscribe;
  }, [hostId, store]);

  const start = async (rule: PortForwardRule) => {
    setPending(rule.id);
    try {
      await store.getState().startRule(profile, rule);
    } finally {
      setPending(null);
    }
  };

  const stop = async (rule: PortForwardRule) => {
    setPending(rule.id);
    try {
      await store.getState().stopRule(rule.id);
    } finally {
      setPending(null);
    }
  };

  const remove = async (rule: PortForwardRule) => {
    setPending(rule.id);
    try {
      if (activeIds.has(rule.id)) {
        await store.getState().stopRule(rule.id);
      }
      await store.getState().deleteRule(rule.id, hostId);
    } finally {
      setPending(null);
    }
  };

  const handleSubmit = async (input: PortForwardRuleInput) => {
    if (input.id) {
      const existing = rules.find((rule) => rule.id === input.id);
      if (!existing) return;
      await store.getState().updateRule({
        ...existing,
        kind: input.kind,
        bindHost: input.bindHost,
        bindPort: input.bindPort,
        targetHost: input.targetHost,
        targetPort: input.targetPort,
        label: input.label ?? null,
      });
    } else {
      await store.getState().createRule(input);
    }
    setFormOpen(false);
  };

  return (
    <div className="grid gap-1.5">
      {rules.length === 0 ? (
        <p className="m-0 text-[12px] text-fog">
          No port forwarding rules
        </p>
      ) : (
        rules.map((rule) => {
          const isActive = activeIds.has(rule.id);
          const isPending = pending === rule.id;
          return (
            <div
              key={rule.id}
              className="flex items-center gap-2 rounded-md border border-graphite/70 bg-obsidian/40 px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-mist">
                  {rule.label ?? kindLabel[rule.kind]}
                </div>
                <div className="truncate font-mono text-[11px] text-fog">
                  {rule.bindHost}:{rule.bindPort} → {describeTarget(rule)}
                </div>
              </div>
              {isPending ? (
                <Loader2 size={14} className="animate-spin text-fog" />
              ) : isActive ? (
                <button
                  type="button"
                  aria-label="Stop"
                  title="Stop"
                  onClick={() => void stop(rule)}
                  className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
                >
                  <Square size={13} />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Start"
                  title="Start"
                  onClick={() => void start(rule)}
                  className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
                >
                  <Play size={13} />
                </button>
              )}
              <button
                type="button"
                aria-label="Edit"
                title={
                  isActive ? "Stop this forward before editing" : "Edit"
                }
                disabled={isActive || isPending}
                onClick={() => {
                  setEditing(rule);
                  setFormOpen(true);
                }}
                className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                aria-label="Delete"
                title="Delete"
                onClick={() => void remove(rule)}
                className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-coral-red"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })
      )}
      <button
        type="button"
        onClick={() => {
          setEditing(undefined);
          setFormOpen(true);
        }}
        className="mt-1 inline-flex items-center justify-center gap-1 rounded-md border border-graphite/70 bg-transparent px-2 py-1 text-[11.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
      >
        <Plus size={12} />
        New rule
      </button>
      <PortForwardForm
        open={formOpen}
        hostId={hostId}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={(input) => {
          void handleSubmit(input);
        }}
      />
    </div>
  );
}

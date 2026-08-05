import { create } from "zustand";
import { createStore, type StateCreator } from "zustand/vanilla";
import type { CreateSshProfile } from "../ssh/sshTypes";
import type { ForwardingApi } from "./forwardingApi";
import { forwardingApi } from "./forwardingApi";
import type {
  PortForwardRule,
  PortForwardRuleInput,
} from "./forwardingTypes";

export type ForwardingState = {
  rulesByHostId: Record<string, PortForwardRule[]>;
  activeIds: Set<string>;
  loadRules: (hostId: string) => Promise<void>;
  loadAllRules: (hostIds: string[]) => Promise<void>;
  createRule: (input: PortForwardRuleInput) => Promise<PortForwardRule>;
  updateRule: (rule: PortForwardRule) => Promise<PortForwardRule>;
  deleteRule: (ruleId: string, hostId: string) => Promise<void>;
  refreshActive: () => Promise<void>;
  startRule: (
    profile: CreateSshProfile,
    rule: PortForwardRule,
    onEvent?: (event: import("../shell/terminalTypes").TerminalEvent) => void,
  ) => Promise<void>;
  stopRule: (ruleId: string) => Promise<void>;
  decideHostKey: (ruleId: string, trust: boolean) => Promise<void>;
};

export function createForwardingState(
  api: ForwardingApi,
): StateCreator<ForwardingState> {
  return (set, get) => ({
    rulesByHostId: {},
    activeIds: new Set(),

    loadRules: async (hostId) => {
      const rules = await api.listRules(hostId);
      set((state) => ({
        rulesByHostId: { ...state.rulesByHostId, [hostId]: rules },
      }));
    },

    loadAllRules: async (hostIds) => {
      const entries = await Promise.all(
        hostIds.map(async (hostId) => [hostId, await api.listRules(hostId)] as const),
      );
      set((state) => ({
        rulesByHostId: { ...state.rulesByHostId, ...Object.fromEntries(entries) },
      }));
    },

    createRule: async (input) => {
      const created = await api.createRule(input);
      set((state) => {
        const existing = state.rulesByHostId[created.hostId] ?? [];
        return {
          rulesByHostId: {
            ...state.rulesByHostId,
            [created.hostId]: [...existing, created],
          },
        };
      });
      return created;
    },

    updateRule: async (rule) => {
      const updated = await api.updateRule(rule);
      set((state) => {
        const existing = state.rulesByHostId[updated.hostId] ?? [];
        return {
          rulesByHostId: {
            ...state.rulesByHostId,
            [updated.hostId]: existing.map((item) =>
              item.id === updated.id ? updated : item,
            ),
          },
        };
      });
      return updated;
    },

    deleteRule: async (ruleId, hostId) => {
      await api.deleteRule(ruleId);
      set((state) => {
        const nextActive = new Set(state.activeIds);
        nextActive.delete(ruleId);
        return {
          rulesByHostId: {
            ...state.rulesByHostId,
            [hostId]: (state.rulesByHostId[hostId] ?? []).filter(
              (rule) => rule.id !== ruleId,
            ),
          },
          activeIds: nextActive,
        };
      });
    },

    refreshActive: async () => {
      const ids = await api.listActive();
      set({ activeIds: new Set(ids) });
    },

    startRule: async (profile, rule, onEvent) => {
      await api.start(
        profile,
        {
          id: rule.id,
          kind: rule.kind,
          bindHost: rule.bindHost,
          bindPort: rule.bindPort,
          targetHost: rule.targetHost,
          targetPort: rule.targetPort,
        },
        onEvent ?? (() => {}),
      );
      await get().refreshActive();
    },

    stopRule: async (ruleId) => {
      await api.stop(ruleId);
      set((state) => {
        const nextActive = new Set(state.activeIds);
        nextActive.delete(ruleId);
        return { activeIds: nextActive };
      });
    },

    decideHostKey: async (ruleId, trust) => {
      await api.decideHostKey(ruleId, trust);
    },
  });
}

export function createForwardingStore(api: ForwardingApi) {
  return createStore<ForwardingState>()(createForwardingState(api));
}

// A store usable both as a React hook (selector subscription) and via
// getState() outside React. `create` yields exactly this; tests build an
// equivalent with `create()(createForwardingState(stubApi))`.
export type ForwardingStore = typeof useForwardingStore;

export const useForwardingStore = create<ForwardingState>()(
  createForwardingState(forwardingApi),
);

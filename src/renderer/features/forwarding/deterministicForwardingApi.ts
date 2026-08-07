import type { ForwardingApi } from "./forwardingApi";
import type { PortForwardRule } from "./forwardingTypes";

function timestamp() {
  return new Date().toISOString();
}

export function createDeterministicForwardingApi(): ForwardingApi {
  const rules = new Map<string, PortForwardRule>();
  const active = new Set<string>();
  let idCounter = 0;

  const nextId = () => {
    idCounter += 1;
    return `rule-${idCounter}`;
  };

  return {
    listRules: (hostId) =>
      Promise.resolve(
        [...rules.values()].filter((rule) => rule.hostId === hostId),
      ),
    createRule: (input) => {
      const id = input.id ?? nextId();
      const now = timestamp();
      const rule: PortForwardRule = {
        id,
        hostId: input.hostId,
        kind: input.kind,
        bindHost: input.bindHost,
        bindPort: input.bindPort,
        targetHost: input.targetHost,
        targetPort: input.targetPort,
        label: input.label ?? null,
        createdAt: now,
        updatedAt: now,
      };
      rules.set(id, rule);
      return Promise.resolve(rule);
    },
    updateRule: (rule) => {
      const updated = { ...rule, updatedAt: timestamp() };
      rules.set(rule.id, updated);
      return Promise.resolve(updated);
    },
    deleteRule: (ruleId) => {
      rules.delete(ruleId);
      active.delete(ruleId);
      return Promise.resolve();
    },
    listActive: () => Promise.resolve([...active]),
    start: (_profile, rule, _onEvent) => {
      active.add(rule.id);
      return Promise.resolve();
    },
    decideHostKey: () => Promise.resolve(),
    stop: (ruleId) => {
      active.delete(ruleId);
      return Promise.resolve();
    },
  };
}

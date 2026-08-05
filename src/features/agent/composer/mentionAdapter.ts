import { useMemo } from "react";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import type { Group, Host } from "@/shared/types";
import type { AgentMentionCategory, AgentMentionItem } from "../agentTypes";

export function buildMentionItems(
  hosts: Host[],
  groups: Group[],
  query: string,
): AgentMentionCategory[] {
  const q = query.trim().toLowerCase();
  const groupHits = groups.filter(
    (group) => !q || group.name.toLowerCase().includes(q),
  );
  const hostHits = hosts.filter(
    (host) =>
      !q ||
      host.name.toLowerCase().includes(q) ||
      host.address.toLowerCase().includes(q),
  );
  const groupItems: AgentMentionItem[] = groupHits.map((group) => ({
    id: group.id,
    type: "group",
    label: group.name,
  }));
  const hostItems: AgentMentionItem[] = hostHits.map((host) => ({
    id: host.id,
    type: "host",
    label: host.name,
  }));
  return [
    { id: "groups", label: "Groups", items: groupItems },
    { id: "hosts", label: "Servers", items: hostItems },
  ];
}

export function useMentionSources() {
  const hostsById = useInventoryStore((state) => state.hosts);
  const groupsById = useInventoryStore((state) => state.groups);
  return useMemo(
    () => ({
      hosts: Object.values(hostsById),
      groups: Object.values(groupsById),
    }),
    [groupsById, hostsById],
  );
}

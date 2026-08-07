import { useCallback, useMemo } from "react";
import {
  unstable_useLiveCompletionAdapter,
  type Unstable_TriggerItem,
} from "@assistant-ui/react";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import type { Group, Host } from "@/shared/types";

export function searchAgentMentionItems(
  hosts: Host[],
  groups: Group[],
  query: string,
): readonly Unstable_TriggerItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (...values: string[]) =>
    !normalizedQuery ||
    values.some((value) =>
      value.toLocaleLowerCase().includes(normalizedQuery),
    );

  const groupItems: Unstable_TriggerItem[] = groups
    .filter((group) => matches(group.name, group.id))
    .map((group) => ({
      id: group.id,
      type: "group",
      label: group.name,
      description: `${hosts.filter((host) => host.groupId === group.id).length} hosts · expands to group`,
      metadata: { icon: "Folder" },
    }));
  const hostItems: Unstable_TriggerItem[] = hosts
    .filter((host) => matches(host.name, host.address, host.id))
    .map((host) => ({
      id: host.id,
      type: "host",
      label: host.name,
      description: host.address,
      metadata: { icon: "Server" },
    }));

  return [...groupItems, ...hostItems];
}

export function useMentionSources() {
  const hostsById = useInventoryStore((state) => state.hosts);
  const groupsById = useInventoryStore((state) => state.groups);
  const status = useInventoryStore((state) => state.status);
  return useMemo(
    () => ({
      hosts: Object.values(hostsById),
      groups: Object.values(groupsById),
      status,
    }),
    [groupsById, hostsById, status],
  );
}

export function mentionSourceVersion(
  hosts: Host[],
  groups: Group[],
  status: string,
): string {
  const groupsVersion = groups
    .map((group) => `${group.id}:${group.name}:${group.updatedAt}`)
    .join("|");
  const hostsVersion = hosts
    .map((host) =>
      `${host.id}:${host.name}:${host.address}:${host.groupId}:${host.updatedAt}`,
    )
    .join("|");
  return `${status}:${groupsVersion}:${hostsVersion}`;
}

export function useAgentMentionCompletionAdapter({
  hosts,
  groups,
  enabled,
}: {
  hosts: Host[];
  groups: Group[];
  enabled: boolean;
}) {
  const fetcher = useCallback(
    async (query: string) => searchAgentMentionItems(hosts, groups, query),
    [groups, hosts],
  );

  return unstable_useLiveCompletionAdapter({ fetcher, enabled });
}

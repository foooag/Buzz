import { unstable_useMentionAdapter } from "@assistant-ui/react";
import { Folder, Server } from "lucide-react";
import { useMemo } from "react";
import { useInventoryStore } from "@/features/inventory/inventoryStore";

export function useAgentMentionAdapter() {
  const activeVaultId = useInventoryStore((state) => state.activeVaultId);
  const hostsById = useInventoryStore((state) => state.hosts);
  const groupsById = useInventoryStore((state) => state.groups);
  const categories = useMemo(() => {
    const hosts = Object.values(hostsById).filter(
      (host) => !activeVaultId || host.vaultId === activeVaultId,
    );
    const groups = Object.values(groupsById).filter(
      (group) => !activeVaultId || group.vaultId === activeVaultId,
    );
    return [
      {
        id: "hosts",
        label: "Servers",
        items: hosts.map((host) => ({
          id: host.id,
          type: "host",
          label: host.name,
          description: host.address,
          icon: "server",
        })),
      },
      {
        id: "groups",
        label: "Groups",
        items: groups.map((group) => ({
          id: group.id,
          type: "group",
          label: group.name,
          description: `${hosts.filter((host) => host.groupId === group.id).length} servers`,
          icon: "folder",
        })),
      },
    ];
  }, [activeVaultId, groupsById, hostsById]);

  return unstable_useMentionAdapter({
    categories,
    includeModelContextTools: false,
    iconMap: { server: Server, folder: Folder, hosts: Server, groups: Folder },
    fallbackIcon: Server,
  });
}

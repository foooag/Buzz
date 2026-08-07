// Single source of truth for the cross-process IPC command contract.
// Consumed by src/main (allowlist + dispatcher) and src/renderer (API layer),
// so the renderer never hardcodes a command string.
export const COMMANDS = {
  appHealth: "app_health",

  aiListProviderConfigs: "ai_list_provider_configs",
  aiCreateProviderConfig: "ai_create_provider_config",
  aiUpdateProviderConfig: "ai_update_provider_config",
  aiDeleteProviderConfig: "ai_delete_provider_config",
  aiTestProviderConfig: "ai_test_provider_config",
  aiProbeProviderConfig: "ai_probe_provider_config",
  aiAgentCreate: "ai_agent_create",
  aiAgentPrompt: "ai_agent_prompt",
  aiAgentSteer: "ai_agent_steer",
  aiAgentAbort: "ai_agent_abort",
  aiAgentDecideTool: "ai_agent_decide_tool",
  aiAgentClose: "ai_agent_close",
  aiListSessions: "ai_list_sessions",
  aiLoadSession: "ai_load_session",
  aiRenameSession: "ai_rename_session",
  aiDeleteSession: "ai_delete_session",

  agentCreate: "agent_create",
  agentPrompt: "agent_prompt",
  agentSteer: "agent_steer",
  agentAbort: "agent_abort",
  agentDecideTool: "agent_decide_tool",
  agentClose: "agent_close",

  inventoryListVaults: "inventory_list_vaults",
  inventoryCreateVault: "inventory_create_vault",
  inventoryUpdateVault: "inventory_update_vault",
  inventoryDeleteVault: "inventory_delete_vault",
  inventoryListGroups: "inventory_list_groups",
  inventoryCreateGroup: "inventory_create_group",
  inventoryListHosts: "inventory_list_hosts",
  inventoryCreateHost: "inventory_create_host",
  inventoryUpdateHost: "inventory_update_host",
  inventoryDeleteHost: "inventory_delete_host",
  inventoryListIdentities: "inventory_list_identities",
  inventoryCreateIdentity: "inventory_create_identity",
  inventoryUpdateIdentity: "inventory_update_identity",
  inventoryDeleteIdentity: "inventory_delete_identity",

  sshStoreCredential: "ssh_store_credential",
  sshOpen: "ssh_open",
  sshDecideHostKey: "ssh_decide_host_key",
  sshReconnect: "ssh_reconnect",
  sshListKnownHosts: "ssh_list_known_hosts",
  sshDeleteKnownHost: "ssh_delete_known_host",

  portForwardStart: "port_forward_start",
  portForwardDecideHostKey: "port_forward_decide_host_key",
  portForwardStop: "port_forward_stop",
  portForwardListActive: "port_forward_list_active",
  portForwardListRules: "port_forward_list_rules",
  portForwardCreateRule: "port_forward_create_rule",
  portForwardUpdateRule: "port_forward_update_rule",
  portForwardDeleteRule: "port_forward_delete_rule",

  terminalOpen: "terminal_open",
  terminalWrite: "terminal_write",
  terminalResize: "terminal_resize",
  terminalClose: "terminal_close",

  sftpOpen: "sftp_open",
  sftpDecideHostKey: "sftp_decide_host_key",
  sftpReconnect: "sftp_reconnect",
  sftpListRemote: "sftp_list_remote",
  sftpListLocal: "sftp_list_local",
  sftpEnqueueUpload: "sftp_enqueue_upload",
  sftpEnqueueDownload: "sftp_enqueue_download",
  sftpResolveConflict: "sftp_resolve_conflict",
  sftpCancelTransfer: "sftp_cancel_transfer",
  sftpDeleteRemote: "sftp_delete_remote",
  sftpRenameRemote: "sftp_rename_remote",
  sftpMkdirRemote: "sftp_mkdir_remote",
  sftpOpenWith: "sftp_open_with",
  sftpResolveOpenWithConflict: "sftp_resolve_open_with_conflict",
  sftpCloseOpenWith: "sftp_close_open_with",
  sftpListAssociations: "sftp_list_associations",
  sftpSetAssociation: "sftp_set_association",
  sftpDeleteAssociation: "sftp_delete_association",
  sftpClose: "sftp_close",
} as const;

// Backwards-compatible exports consumed by src/main and tests/main.
// Object.values on an `as const` object yields CommandName[], matching the
// original readonly-string-array shape the allowlist consumed.
export const COMMAND_NAMES = Object.values(COMMANDS);
export type CommandName = (typeof COMMANDS)[keyof typeof COMMANDS];

const commandSet = new Set<string>(COMMAND_NAMES);

export function isCommandName(value: unknown): value is CommandName {
  return typeof value === "string" && commandSet.has(value);
}

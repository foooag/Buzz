import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../../../../electron/ipc/domain-error";
import type { CommandContext } from "../../../../electron/ipc/dispatcher";
import { createInventoryCommandHandlers } from "../../../../electron/domains/inventory/commands";
import type { InventoryRepository } from "../../../../electron/domains/inventory/repository";

describe("Electron inventory command handlers", () => {
  const context: CommandContext = { ownerId: "test-owner", fallback: vi.fn() };
  it("routes every inventory IPC command without exposing the repository", async () => {
    const repository = fakeRepository();
    const handlers = createInventoryCommandHandlers(repository);
    const cases = [
      ["inventory_list_vaults", {}, "listVaults"],
      ["inventory_create_vault", { input: { name: "Main" } }, "createVault"],
      ["inventory_update_vault", { input: { id: "v1", name: "Main" } }, "updateVault"],
      ["inventory_delete_vault", { id: "v1" }, "deleteVault"],
      ["inventory_list_groups", { vaultId: "v1" }, "listGroups"],
      ["inventory_create_group", {
        input: { vaultId: "v1", parentId: null, name: "Ops" },
      }, "createGroup"],
      ["inventory_list_hosts", { vaultId: "v1" }, "listHosts"],
      ["inventory_create_host", {
        input: {
          vaultId: "v1", groupId: null, name: "Server", address: "host",
          authKind: "password", credentialRef: "opaque-reference",
        },
      }, "createHost"],
      ["inventory_update_host", {
        input: {
          id: "h1", vaultId: "v1", groupId: null, name: "Server", address: "host",
          username: "root", tags: [], notes: "",
        },
      }, "updateHost"],
      ["inventory_delete_host", { id: "h1" }, "deleteHost"],
      ["inventory_list_identities", { vaultId: "v1" }, "listIdentities"],
      ["inventory_create_identity", {
        input: { vaultId: "v1", name: "Admin" },
      }, "createIdentity"],
      ["inventory_update_identity", {
        input: { id: "i1", vaultId: "v1", name: "Admin" },
      }, "updateIdentity"],
      ["inventory_delete_identity", { id: "i1" }, "deleteIdentity"],
    ] as const;

    for (const [name, input, method] of cases) {
      const handler = handlers[name];
      expect(handler, `${name} should be handled by Electron`).toBeTypeOf("function");
      await expect(Promise.resolve(handler?.(input, context))).resolves.toEqual({
        ok: true,
        data: method,
      });
      expect(repository[method]).toHaveBeenCalledOnce();
    }
  });

  it("rejects malformed command envelopes before calling the repository", async () => {
    const repository = fakeRepository();
    const handler = createInventoryCommandHandlers(repository).inventory_create_host;

    await expect(Promise.resolve(
      handler?.({ input: { vaultId: "v1", name: "Missing address" } }, context),
    ))
      .resolves.toEqual({
        ok: false,
        error: {
          code: "IPC_INVALID_INPUT",
          message: "The desktop operation received invalid input.",
        },
      });
    expect(repository.createHost).not.toHaveBeenCalled();
  });

  it("preserves safe domain error codes and messages", async () => {
    const repository = fakeRepository();
    vi.mocked(repository.createVault).mockImplementation(() => {
      throw new DomainError("INVENTORY_CONFLICT", "A vault with this name already exists.");
    });
    const handler = createInventoryCommandHandlers(repository).inventory_create_vault;

    await expect(Promise.resolve(
      handler?.({ input: { name: "Duplicate" } }, context),
    )).resolves.toEqual({
      ok: false,
      error: {
        code: "INVENTORY_CONFLICT",
        message: "A vault with this name already exists.",
      },
    });
  });

  it("accepts the null input used by the list-vaults renderer call", async () => {
    const repository = fakeRepository();
    const handler = createInventoryCommandHandlers(repository).inventory_list_vaults;

    await expect(Promise.resolve(handler?.(null, context))).resolves.toEqual({
      ok: true,
      data: "listVaults",
    });
  });
});

function fakeRepository(): InventoryRepository {
  const methods = [
    "listVaults", "createVault", "updateVault", "deleteVault", "listGroups", "createGroup",
    "listHosts", "createHost", "updateHost", "deleteHost", "listIdentities",
    "createIdentity", "updateIdentity", "deleteIdentity",
  ] as const;
  return Object.fromEntries(
    methods.map((name) => [name, vi.fn(() => name)]),
  ) as unknown as InventoryRepository;
}

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MentionPopover } from "@/features/agent/mention/MentionPopover";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import type { Group, Host, Identity } from "@/shared/types";

const ts = "2026-08-05T00:00:00.000Z";
function seed() {
  const groups: Group[] = [{ id: "g1", vaultId: "v1", parentId: null, name: "Production", color: "coral", count: 1, createdAt: ts, updatedAt: ts }];
  const hosts: Host[] = [{ id: "h1", vaultId: "v1", groupId: "g1", name: "web-prod-01", address: "10.0.0.10", username: "ubuntu", tags: [], notes: "", status: "online", createdAt: ts, updatedAt: ts }];
  useInventoryStore.getState().setResources(groups, hosts, [] as Identity[]);
}

describe("MentionPopover", () => {
  it("renders Groups/Servers headers and options when open", () => {
    seed();
    render(<MentionPopover open query="" hosts={Object.values(useInventoryStore.getState().hosts)} groups={Object.values(useInventoryStore.getState().groups)} enabled onSelect={() => undefined} onClose={() => undefined} />);
    expect(screen.getByLabelText("Mention target")).toBeVisible();
    expect(screen.getByText("Groups")).toBeVisible();
    expect(screen.getByText("Servers")).toBeVisible();
    expect(screen.getByRole("option", { name: /Production/ })).toBeVisible();
    expect(screen.getByRole("option", { name: /web-prod-01/ })).toBeVisible();
  });

  it("calls onSelect with the clicked item", async () => {
    seed();
    const onSelect = vi.fn();
    render(<MentionPopover open query="" hosts={Object.values(useInventoryStore.getState().hosts)} groups={Object.values(useInventoryStore.getState().groups)} enabled onSelect={onSelect} onClose={() => undefined} />);
    await userEvent.click(screen.getByRole("option", { name: /web-prod-01/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "h1", type: "host" }));
  });
});

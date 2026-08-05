import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MentionComposer } from "@/features/agent/composer/MentionComposer";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import type { Group, Host, Identity } from "@/shared/types";

const timestamp = "2026-08-05T00:00:00.000Z";

function seedInventory() {
  const groups: Group[] = [{
    id: "g1",
    vaultId: "v1",
    parentId: null,
    name: "Production",
    color: "coral",
    count: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
  const hosts: Host[] = [{
    id: "h1",
    vaultId: "v1",
    groupId: "g1",
    name: "web-prod-01",
    address: "10.0.0.10",
    username: "ubuntu",
    tags: [],
    notes: "",
    status: "online",
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
  useInventoryStore.getState().setResources(
    groups,
    hosts,
    [] as Identity[],
  );
}

describe("MentionComposer", () => {
  it("sends text on Enter", async () => {
    seedInventory();
    let sent = "";
    render(<Harness onSend={(text) => { sent = text; }} />);
    await userEvent.type(screen.getByLabelText("Message agent"), "uptime{Enter}");
    expect(sent).toBe("uptime");
  });

  it("opens the mention picker on @ and inserts a host directive", async () => {
    seedInventory();
    render(<Harness onSend={() => undefined} />);
    const input = screen.getByLabelText("Message agent");
    await userEvent.type(input, "run @");
    expect(await screen.findByText("Mention target")).toBeVisible();
    expect(screen.getByText("Groups")).toBeVisible();
    expect(screen.getByText("Servers")).toBeVisible();
    await userEvent.click(screen.getByRole("option", { name: /web-prod-01/ }));
    expect(input).toHaveValue("run :host[web-prod-01]{name=h1}");
  });

  it("filters mentions by query", async () => {
    seedInventory();
    render(<Harness onSend={() => undefined} />);
    const input = screen.getByLabelText("Message agent");
    await userEvent.type(input, "@web-prod");
    expect(await screen.findByText("Mention target")).toBeVisible();
    expect(screen.getByRole("option", { name: /web-prod-01/ })).toBeVisible();
    expect(screen.queryByText("No servers or groups match")).toBeNull();
  });
});

function Harness({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <MentionComposer
      input={value}
      onInputChange={setValue}
      onSend={onSend}
      busy={false}
      awaitingConfirm={false}
    />
  );
}

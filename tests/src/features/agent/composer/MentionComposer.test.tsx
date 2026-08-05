import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
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

function appendText(message: AppendMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

describe("MentionComposer", () => {
  it("sends text on Enter", async () => {
    seedInventory();
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    await userEvent.type(
      screen.getByLabelText("Message agent"),
      "uptime{Enter}",
    );
    expect(onSend).toHaveBeenCalledWith("uptime");
  });

  it("opens the mention picker on @ and inserts a friendly host mention", async () => {
    seedInventory();
    render(<Harness onSend={() => undefined} />);
    const input = screen.getByLabelText("Message agent");
    await userEvent.type(input, "run @");
    expect(await screen.findByText("Mention target")).toBeVisible();
    expect(screen.getByText("Groups")).toBeVisible();
    expect(screen.getByText("Servers")).toBeVisible();
    await userEvent.click(screen.getByRole("option", { name: /web-prod-01/ }));
    await waitFor(() => {
      expect((input as HTMLTextAreaElement).value).toContain(
        "run @web-prod-01",
      );
    });
  });

  it("filters mentions by query", async () => {
    seedInventory();
    render(<Harness onSend={() => undefined} />);
    const input = screen.getByLabelText("Message agent");
    await userEvent.type(input, "@web-prod");
    expect(await screen.findByText("Mention target")).toBeVisible();
    expect(screen.getByRole("option", { name: /web-prod-01/ })).toBeVisible();
    expect(screen.queryByText(/No servers or groups match/)).toBeNull();
  });
});

function Harness({ onSend }: { onSend: (text: string) => void }) {
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: [],
    convertMessage: (message) => message,
    onNew: async (message) => {
      onSend(appendText(message));
    },
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MentionComposer
        busy={false}
        awaitingConfirm={false}
        onAbort={() => undefined}
      />
    </AssistantRuntimeProvider>
  );
}

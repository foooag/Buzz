import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { MentionComposer } from "@/features/agent/composer/MentionComposer";
import { searchAgentMentionItems } from "@/features/agent/composer/mentionAdapter";
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
  it("keeps accepting input after applying a restored draft", async () => {
    seedInventory();
    render(<RestoredDraftHarness />);
    const input = screen.getByLabelText("Message agent");

    await userEvent.click(input);
    await userEvent.paste("w");
    await waitFor(() => expect(input).toHaveValue("w"));
    await userEvent.paste("h");

    await waitFor(() => expect(input).toHaveValue("wh"));
  });

  it("sends text on Enter", async () => {
    seedInventory();
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    const input = screen.getByLabelText("Message agent");
    await typeComposer(input, "uptime{Enter}");
    expect(onSend).toHaveBeenCalledWith("uptime");
  });

  it("opens the official trigger popover and inserts a host directive", async () => {
    seedInventory();
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    const input = screen.getByLabelText("Message agent");
    await typeComposer(input, "run @");
    expect(await screen.findByText("正在加载服务器和分组…")).toBeVisible();
    expect(await screen.findByRole("option", { name: /Production/ })).toBeVisible();
    await userEvent.click(screen.getByRole("option", { name: /web-prod-01/ }));
    await waitFor(() => expect(input).toHaveValue(
      "run :host[web-prod-01]{name=h1} ",
    ));
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith(
      "run :host[web-prod-01]{name=h1} ",
    );
  });

  it("filters mentions by query", async () => {
    seedInventory();
    render(<Harness onSend={() => undefined} />);
    const input = screen.getByLabelText("Message agent");
    await typeComposer(input, "@web-prod");
    expect(await screen.findByRole("option", { name: /web-prod-01/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /Production/ })).toBeNull();
    expect(screen.queryByText("没有匹配的服务器或分组")).toBeNull();
  });

  it("inserts a group directive", async () => {
    seedInventory();
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    const input = screen.getByLabelText("Message agent");
    await typeComposer(input, "run @Prod");
    await userEvent.click(
      await screen.findByRole("option", { name: /Production/ }),
    );
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith(
      "run :group[Production]{name=g1} ",
    );
  });

  it("refreshes cached search results when inventory changes", async () => {
    seedInventory();
    render(<Harness onSend={() => undefined} />);
    const input = screen.getByLabelText("Message agent");
    await typeComposer(input, "@api");
    expect(await screen.findByText("没有匹配的服务器或分组")).toBeVisible();

    const state = useInventoryStore.getState();
    const hosts = Object.values(state.hosts);
    const groups = Object.values(state.groups);
    useInventoryStore.getState().setResources(groups, [
      ...hosts,
      {
        ...hosts[0]!,
        id: "h2",
        name: "api-prod-01",
        address: "10.0.0.20",
        updatedAt: "2026-08-05T00:01:00.000Z",
      },
    ], []);

    expect(
      await screen.findByRole("option", { name: /api-prod-01/ }),
    ).toBeVisible();
  });

  it("searches names, addresses, and internal IDs with groups first", () => {
    seedInventory();
    const state = useInventoryStore.getState();
    const hosts = Object.values(state.hosts);
    const groups = Object.values(state.groups);

    expect(searchAgentMentionItems(hosts, groups, "").map((item) => item.type))
      .toEqual(["group", "host"]);
    expect(searchAgentMentionItems(hosts, groups, "10.0.0.10")[0])
      .toMatchObject({ id: "h1", type: "host", label: "web-prod-01" });
    expect(searchAgentMentionItems(hosts, groups, "h1")[0])
      .toMatchObject({ id: "h1", type: "host" });
    expect(searchAgentMentionItems(hosts, groups, "g1")[0])
      .toMatchObject({ id: "g1", type: "group" });
  });
});

async function typeComposer(input: HTMLElement, text: string): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText("Message agent")).toBeEnabled());
  input = screen.getByLabelText("Message agent");
  const submit = text.endsWith("{Enter}");
  const content = submit ? text.slice(0, -"{Enter}".length) : text;
  await userEvent.click(input);
  fireEvent.keyDown(input, { key: "End" });
  if (content) {
    const previousValue = (input as HTMLTextAreaElement).value;
    await userEvent.paste(content);
    await waitFor(() => expect(input).toHaveValue(previousValue + content));
  }
  if (submit) await userEvent.keyboard("{Enter}");
}

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

const restoredDraft = { text: "", nonce: 1 };

function RestoredDraftHarness() {
  const [, setComposerText] = useState("");
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: [],
    convertMessage: (message) => message,
    onNew: async () => undefined,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MentionComposer
        busy={false}
        awaitingConfirm={false}
        draft={restoredDraft}
        onTextChange={setComposerText}
      />
    </AssistantRuntimeProvider>
  );
}

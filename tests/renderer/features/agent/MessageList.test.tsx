import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UIMessage } from "@ai-sdk/react";
import { MessageList } from "@/features/agent/MessageList";

const userMsg: UIMessage = {
  id: "u",
  role: "user",
  parts: [{ type: "text", text: "check :host[web-prod-01]{name=h1}" }],
} as UIMessage;
const toolMsg: UIMessage = {
  id: "a",
  role: "assistant",
  parts: [
    {
      type: "tool-host_exec" as any,
      toolCallId: "c1",
      toolName: "host_exec",
      state: "output-available",
      input: { hostId: "h1", command: "docker ps" },
      output: {
        result: { details: { stdout: "", stderr: "permission denied", exitCode: 1 } },
        isError: false,
        timing: { startedAt: 1, completedAt: 2 },
      },
    } as any,
  ],
} as UIMessage;

describe("MessageList", () => {
  it("renders a user message with a directive chip", () => {
    render(
      <MessageList
        messages={[userMsg]}
        streaming={false}
        streamRef={{ current: null }}
        onCopySelection={() => undefined}
      />,
    );
    expect(screen.getByText("web-prod-01")).toBeInTheDocument();
  });

  it("renders a tool card with stderr and failed status", () => {
    render(
      <MessageList
        messages={[toolMsg]}
        streaming={false}
        streamRef={{ current: null }}
        onCopySelection={() => undefined}
      />,
    );
    expect(screen.getByText("permission denied")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressPanel } from "../../../../src/renderer/features/agent/ProgressPanel";

describe("ProgressPanel", () => {
  it("groups commands under their host", () => {
    render(<ProgressPanel hosts={[{
      hostId: "h1",
      phase: "success",
      commands: [{
        toolCallId: "t1",
        command: "uptime",
        status: "success",
        output: "up 10 days",
      }],
    }]} />);

    expect(screen.getByText("h1")).toBeVisible();
    expect(screen.getByText("uptime")).toBeVisible();
  });
});

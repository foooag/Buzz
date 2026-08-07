import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressPanel } from "@/features/agent/ProgressPanel";
import type { HostProgress } from "@/features/agent/progressTypes";

describe("ProgressPanel", () => {
  it("groups command steps by host", () => {
    const progress: HostProgress[] = [{
      hostId: "h1",
      hostLabel: "web-prod-01",
      phase: "done",
      commands: [{
        id: "c1",
        command: "uptime",
        status: "ok",
        output: " 1:00 up 3 days",
      }],
    }];
    render(<ProgressPanel progress={progress} />);
    expect(screen.getByText("web-prod-01")).toBeVisible();
    expect(screen.getByText("uptime")).toBeVisible();
    expect(screen.getByText("1/1 done")).toBeVisible();
  });

  it("shows a working host with an awaiting-confirmation command", () => {
    const progress: HostProgress[] = [{
      hostId: "h1",
      hostLabel: "bastion-jump",
      phase: "working",
      commands: [{
        id: "c1",
        command: "rm -rf /var/log/old/*",
        status: "running",
        awaitingConfirmation: true,
      }],
    }];
    render(<ProgressPanel progress={progress} />);
    expect(screen.getByText("bastion-jump")).toBeVisible();
    expect(screen.getByText("rm -rf /var/log/old/*")).toBeVisible();
  });
});

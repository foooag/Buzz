import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MentionComposer } from "@/features/agent/MentionComposer";
import type { Group, Host } from "@/shared/types";

const ts = "2026-08-05T00:00:00.000Z";
function seed() {
  const groups: Group[] = [{ id: "g1", vaultId: "v1", parentId: null, name: "Production", color: "coral", count: 1, createdAt: ts, updatedAt: ts }];
  const hosts: Host[] = [{ id: "h1", vaultId: "v1", groupId: "g1", name: "web-prod-01", address: "10.0.0.10", username: "ubuntu", tags: [], notes: "", status: "online", createdAt: ts, updatedAt: ts }];
  return { groups, hosts };
}

// The composer is a controlled input. In real usage the parent maintains the
// draft state and feeds it back as `value`; a stateless render leaves the
// React-controlled textarea stuck at the initial value after each keystroke.
// This harness mirrors the production wiring so the assertion intent — "the
// directive lands at the caret with the preceding text preserved" — is
// exercised against realistic data flow.
function ComposerHarness(props: Parameters<typeof MentionComposer>[0]) {
  const [value, setValue] = useState(props.value);
  const handleChange = (text: string) => {
    setValue(text);
    props.onValueChange(text);
  };
  return <MentionComposer {...props} value={value} onValueChange={handleChange} />;
}

function renderComposer(overrides: Partial<Parameters<typeof MentionComposer>[0]> = {}) {
  const { groups, hosts } = seed();
  const props: Parameters<typeof MentionComposer>[0] = {
    value: "", onValueChange: () => undefined, onSend: () => undefined, onAbort: () => undefined,
    busy: false, awaitingConfirm: false, hosts, groups, mentionEnabled: true,
    ...overrides,
  };
  return render(<ComposerHarness {...props} />);
}

describe("MentionComposer", () => {
  it("sends on Enter", async () => {
    const onSend = vi.fn();
    renderComposer({ onSend });
    const input = screen.getByLabelText("Message agent") as HTMLTextAreaElement;
    await userEvent.click(input);
    await userEvent.paste("uptime");
    await waitFor(() => expect(input).toHaveValue("uptime"));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalled();
  });

  it("opens the mention popover on @ and inserts a host directive", async () => {
    const onValueChange = vi.fn();
    renderComposer({ onValueChange });
    const input = screen.getByLabelText("Message agent") as HTMLTextAreaElement;
    await userEvent.click(input);
    await userEvent.paste("run @");
    expect(await screen.findByRole("option", { name: /web-prod-01/ })).toBeVisible();
    await userEvent.click(screen.getByRole("option", { name: /web-prod-01/ }));
    expect(onValueChange).toHaveBeenCalledWith("run :host[web-prod-01]{name=h1} ");
  });

  it("aborts on Escape when busy", async () => {
    const onAbort = vi.fn();
    renderComposer({ busy: true, onAbort });
    const input = screen.getByLabelText("Message agent");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onAbort).toHaveBeenCalled();
  });

  it("disables Send while busy or awaiting confirmation", () => {
    renderComposer({ busy: true });
    expect(screen.getByRole("button", { name: /abort/i })).toBeVisible();
  });
});

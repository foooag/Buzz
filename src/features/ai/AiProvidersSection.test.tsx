import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiProvidersSection, AI_PROVIDER_PRESETS } from "./AiProvidersSection";
import { createDeterministicAiConfigApi } from "./deterministicAiApi";
import { IpcCommandError } from "../../app/ipc";
import type { AiConfigApi, AiProviderConfig } from "./aiConfigTypes";

const timestamp = "2026-07-31T08:00:00.000Z";

function provider(
  patch: Partial<AiProviderConfig> = {},
): AiProviderConfig {
  return {
    id: "provider-1",
    providerKind: "openai",
    name: "GPT-4o",
    baseUrl: "https://api.openai.com/v1",
    modelId: "gpt-4o",
    credentialConfigured: true,
    credentialHint: "sk-••••••••X7K2",
    isDefault: false,
    connectionStatus: "untested",
    capabilities: {
      streaming: "untested",
      toolCalling: "untested",
      structuredOutput: "untested",
      reasoning: "untested",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...patch,
  };
}

describe("AiProvidersSection", () => {
  it("renders the empty state and all nine provider presets", async () => {
    const user = userEvent.setup();
    render(<AiProvidersSection api={createDeterministicAiConfigApi()} />);

    expect(
      await screen.findByText("No AI providers configured yet."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add provider" }));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(9);
    expect(options.map((option) => option.getAttribute("value"))).toEqual(
      AI_PROVIDER_PRESETS.map((preset) => preset.id),
    );
  });

  it("changes the default endpoint and hides the key for Ollama", async () => {
    const user = userEvent.setup();
    render(<AiProvidersSection api={createDeterministicAiConfigApi()} />);
    await user.click(await screen.findByRole("button", { name: "Add provider" }));

    await user.selectOptions(
      screen.getByLabelText("Provider type"),
      "ollama",
    );
    expect(screen.getByLabelText("Base URL")).toHaveValue(
      "http://127.0.0.1:11434/v1",
    );
    expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
    expect(
      screen.getByText("Local runtime — no API key required."),
    ).toBeVisible();
  });

  it("auto-fills the coding-plan endpoints when their kind is picked", async () => {
    const user = userEvent.setup();
    render(<AiProvidersSection api={createDeterministicAiConfigApi()} />);
    await user.click(await screen.findByRole("button", { name: "Add provider" }));

    await user.selectOptions(
      screen.getByLabelText("Provider type"),
      "glmCodingPlan",
    );
    expect(screen.getByLabelText("Base URL")).toHaveValue(
      "https://open.bigmodel.cn/api/coding/paas/v4",
    );

    await user.selectOptions(
      screen.getByLabelText("Provider type"),
      "kimiCode",
    );
    expect(screen.getByLabelText("Base URL")).toHaveValue(
      "https://api.kimi.com/coding/v1",
    );
  });

  it("creates, edits, tests, and deletes through the provider API", async () => {
    const user = userEvent.setup();
    const api = createDeterministicAiConfigApi();
    const create = vi.spyOn(api, "create");
    const update = vi.spyOn(api, "update");
    const test = vi.spyOn(api, "test");
    const remove = vi.spyOn(api, "delete");
    render(<AiProvidersSection api={api} />);

    await user.click(await screen.findByRole("button", { name: "Add provider" }));
    await user.type(screen.getByLabelText("Display name"), "My Claude");
    await user.type(screen.getByLabelText("Model ID"), "claude-sonnet");
    await user.type(screen.getByLabelText("API key"), "sk-secret-1234");
    await user.click(screen.getByRole("button", { name: "Save provider" }));
    expect(await screen.findByText("My Claude")).toBeVisible();
    expect(create).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Edit My Claude" }));
    expect(screen.getByLabelText("API key")).toHaveValue("");
    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "Claude Updated");
    await user.click(screen.getByRole("button", { name: "Save provider" }));
    expect(await screen.findByText("Claude Updated")).toBeVisible();
    expect(update.mock.calls[0]?.[0].apiKey).toBeUndefined();

    await user.click(
      screen.getByRole("button", { name: "Test Claude Updated" }),
    );
    await waitFor(() => expect(test).toHaveBeenCalled());
    expect(await screen.findByText(/Connected · 412 ms/)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Remove Claude Updated" }),
    );
    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(
      screen.getByText("No AI providers configured yet."),
    ).toBeVisible();
  });

  it("never places the original credential in the DOM", async () => {
    const secret = "sk-original-super-secret";
    const item = provider({ credentialHint: "sk-••••••••cret" });
    render(
      <AiProvidersSection
        api={createDeterministicAiConfigApi([item])}
      />,
    );
    expect(await screen.findByText("GPT-4o")).toBeVisible();
    expect(document.body.textContent).not.toContain(secret);
    expect(screen.getByText("sk-••••••••cret")).toBeVisible();
  });

  it("disables Test connection until Base URL and Model ID are filled", async () => {
    const user = userEvent.setup();
    render(<AiProvidersSection api={createDeterministicAiConfigApi()} />);
    await user.click(await screen.findByRole("button", { name: "Add provider" }));

    const testButton = screen.getByRole("button", { name: /Test connection/ });
    expect(testButton).toBeDisabled();
    expect(
      screen.getByText("Fill Base URL and Model ID to probe the endpoint."),
    ).toBeVisible();

    await user.type(screen.getByLabelText("Model ID"), "claude-sonnet");
    await user.type(
      screen.getByLabelText("API key"),
      "sk-secret-1234",
    );
    expect(testButton).toBeEnabled();
  });

  it("probes the edited endpoint from the edit form without persisting", async () => {
    const user = userEvent.setup();
    const api = createDeterministicAiConfigApi([
      provider({ id: "provider-1", name: "Claude", baseUrl: "https://api.anthropic.com" }),
    ]);
    const update = vi.spyOn(api, "update");
    const test = vi.spyOn(api, "test");
    const probe = vi.spyOn(api, "probe");
    render(<AiProvidersSection api={api} />);

    await user.click(await screen.findByRole("button", { name: "Edit Claude" }));
    const baseUrlField = screen.getByLabelText("Base URL");
    await user.clear(baseUrlField);
    await user.type(baseUrlField, "https://proxy.anthropic.example");
    await user.click(screen.getByRole("button", { name: /Test connection/ }));

    await waitFor(() => expect(probe).toHaveBeenCalled());
    expect(probe.mock.calls[0]?.[0].baseUrl).toBe("https://proxy.anthropic.example");
    expect(probe.mock.calls[0]?.[0].existingId).toBe("provider-1");
    expect(update).not.toHaveBeenCalled();
    expect(test).not.toHaveBeenCalled();
  });

  it("probes a brand-new provider before it is saved", async () => {
    const user = userEvent.setup();
    const api = createDeterministicAiConfigApi();
    const create = vi.spyOn(api, "create");
    const update = vi.spyOn(api, "update");
    const probe = vi.spyOn(api, "probe");
    render(<AiProvidersSection api={api} />);

    await user.click(await screen.findByRole("button", { name: "Add provider" }));
    await user.type(screen.getByLabelText("Model ID"), "claude-sonnet");
    await user.type(screen.getByLabelText("API key"), "sk-secret-1234");
    await user.click(screen.getByRole("button", { name: /Test connection/ }));

    await waitFor(() => expect(probe).toHaveBeenCalled());
    expect(probe.mock.calls[0]?.[0].existingId).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("surfaces the backend error message when saving fails", async () => {
    const user = userEvent.setup();
    const api: AiConfigApi = createDeterministicAiConfigApi();
    vi.spyOn(api, "create").mockRejectedValue(
      new IpcCommandError({
        code: "AI_CONFIG_INSECURE_ENDPOINT",
        message: "Cloud providers require HTTPS endpoints.",
      }),
    );
    render(<AiProvidersSection api={api} />);

    await user.click(await screen.findByRole("button", { name: "Add provider" }));
    await user.type(screen.getByLabelText("Display name"), "Bad Provider");
    await user.type(screen.getByLabelText("Model ID"), "glm-5.2");
    await user.type(screen.getByLabelText("API key"), "sk-coding-plan");
    await user.click(screen.getByRole("button", { name: "Save provider" }));

    expect(
      await screen.findByText("Cloud providers require HTTPS endpoints."),
    ).toBeVisible();
  });
});

import { describe, expect, it } from "vitest";
import { aiProviderConfigSchema } from "./aiConfigSchema";
import { createDeterministicAiConfigApi } from "./deterministicAiApi";

describe("deterministic aiConfig api", () => {
  it("creates and lists a config without leaking the api key", async () => {
    const api = createDeterministicAiConfigApi();
    const created = await api.create({
      providerKind: "anthropic",
      name: "My Claude",
      baseUrl: "",
      modelId: "claude-sonnet",
      apiKey: "sk-secret",
      isDefault: true,
    });
    expect(created).not.toHaveProperty("apiKey");
    expect(aiProviderConfigSchema.safeParse(created).success).toBe(true);
    expect(await api.list()).toHaveLength(1);
  });

  it("updates and deletes", async () => {
    const api = createDeterministicAiConfigApi();
    const created = await api.create({
      providerKind: "openai", name: "GPT", baseUrl: "", modelId: "gpt-4o", apiKey: "k", isDefault: false,
    });
    const updated = await api.update({ ...created, name: "GPT-2" });
    expect(updated.name).toBe("GPT-2");
    await api.delete(created.id);
    expect(await api.list()).toHaveLength(0);
  });
});

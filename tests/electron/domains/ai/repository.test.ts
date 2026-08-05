import { describe, expect, it } from "vitest";
import { AesGcmFieldCipher } from "../../../../electron/domains/inventory/field-cipher";
import { AiConfigRepository } from "../../../../electron/domains/ai/repository";
import { openAiDatabase } from "../../../../electron/domains/ai/database";

describe("Electron AI config repository", () => {
  it("encrypts credentials and preserves them when an update leaves the key blank", () => {
    const database = openAiDatabase(":memory:");
    const repository = new AiConfigRepository(database, new AesGcmFieldCipher(Buffer.alloc(32, 7)));
    const created = repository.create({
      providerKind: "openai", name: "Primary", baseUrl: "", modelId: "gpt-test",
      apiKey: "sk-super-secret", isDefault: true,
    });

    expect(created).toMatchObject({
      baseUrl: "https://api.openai.com/v1", credentialConfigured: true,
      credentialHint: "sk-••••••••cret", isDefault: true,
    });
    const stored = database.prepare("SELECT api_key FROM ai_provider_configs WHERE id = ?")
      .get(created.id)?.api_key as Uint8Array;
    expect(Buffer.from(stored).includes(Buffer.from("sk-super-secret"))).toBe(false);

    const updated = repository.update({
      id: created.id, providerKind: "openai", name: "Renamed", baseUrl: "",
      modelId: "gpt-test", isDefault: true,
    });
    expect(updated.name).toBe("Renamed");
    expect(repository.getResolved(created.id).apiKey).toBe("sk-super-secret");
  });

  it("enforces endpoint, token, credential and single-default validation", () => {
    const repository = new AiConfigRepository(
      openAiDatabase(":memory:"),
      new AesGcmFieldCipher(Buffer.alloc(32, 8)),
    );
    expect(() => repository.create({
      providerKind: "custom", name: "Bad", baseUrl: "http://example.com",
      modelId: "model", apiKey: "key", isDefault: false,
    })).toThrowError(expect.objectContaining({ code: "AI_CONFIG_INSECURE_ENDPOINT" }));
    expect(() => repository.create({
      providerKind: "openai", name: "No key", baseUrl: "", modelId: "model",
      isDefault: false,
    })).toThrowError(expect.objectContaining({ code: "AI_CONFIG_VALIDATION_FAILED" }));

    const first = repository.create({
      providerKind: "ollama", name: "One", baseUrl: "", modelId: "one", isDefault: true,
    });
    const second = repository.create({
      providerKind: "ollama", name: "Two", baseUrl: "", modelId: "two", isDefault: true,
    });
    expect(repository.list().filter((item) => item.isDefault).map((item) => item.id))
      .toEqual([second.id]);
    expect(first.credentialConfigured).toBe(false);
  });

  it("refuses to open an AI database newer than this Electron build", () => {
    const database = openAiDatabase(":memory:");
    database.exec("PRAGMA user_version = 99");
    expect(() => new AiConfigRepository(
      database,
      new AesGcmFieldCipher(Buffer.alloc(32, 11)),
    )).toThrowError(expect.objectContaining({ code: "AI_CONFIG_MIGRATION_FAILED" }));
  });
});

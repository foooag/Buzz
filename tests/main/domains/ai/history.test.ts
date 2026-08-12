import { describe, expect, it } from "vitest";
import { AesGcmFieldCipher } from "../../../../src/main/domains/inventory/field-cipher";
import { AiHistoryRepository } from "../../../../src/main/domains/ai/history";
import { openAiDatabase } from "../../../../src/main/domains/ai/database";

describe("Electron AI history repository", () => {
  it("encrypts, lists, loads, updates and deletes session messages", () => {
    const database = openAiDatabase(":memory:");
    const history = new AiHistoryRepository(
      database,
      new AesGcmFieldCipher(Buffer.alloc(32, 9)),
    );
    const saved = history.save({
      title: "Investigate", providerConfigId: "provider-1", sshSessionId: "ssh-1",
      messages: [{ role: "user", content: "private command" }],
    });
    const encrypted = database.prepare("SELECT encrypted_messages FROM ai_sessions WHERE id = ?")
      .get(saved.id)?.encrypted_messages as Uint8Array;
    expect(Buffer.from(encrypted).includes(Buffer.from("private command"))).toBe(false);
    expect(history.list()).toEqual([saved]);
    expect(history.load(saved.id).messages).toEqual([
      { role: "user", content: "private command" },
    ]);

    const updated = history.save({
      id: saved.id, title: "Resolved", providerConfigId: "provider-1",
      sshSessionId: "ssh-1", messages: [],
    });
    expect(updated.createdAt).toBe(saved.createdAt);
    expect(history.load(saved.id)).toMatchObject({ title: "Resolved", messages: [] });
    history.delete(saved.id);
    expect(() => history.load(saved.id)).toThrowError(
      expect.objectContaining({ code: "AI_HISTORY_NOT_FOUND" }),
    );
  });

  it("stores multi-host Agent history without an SSH session id", () => {
    const history = new AiHistoryRepository(
      openAiDatabase(":memory:"),
      new AesGcmFieldCipher(Buffer.alloc(32, 11)),
    );

    const saved = history.save({
      title: "Ops agent task",
      providerConfigId: "provider-1",
      sshSessionId: "",
      messages: [{ role: "user", content: "Check the fleet" }],
    });

    expect(saved.sshSessionId).toBe("");
    expect(history.load(saved.id).messages).toEqual([
      { role: "user", content: "Check the fleet" },
    ]);
  });

  it("rejects invalid metadata and a session larger than capacity", () => {
    const history = new AiHistoryRepository(
      openAiDatabase(":memory:"),
      new AesGcmFieldCipher(Buffer.alloc(32, 10)),
      64,
    );
    expect(() => history.save({
      title: "", providerConfigId: "p", sshSessionId: "s", messages: [],
    })).toThrowError(expect.objectContaining({ code: "AI_HISTORY_INVALID" }));
    expect(() => history.save({
      title: "large", providerConfigId: "p", sshSessionId: "s",
      messages: "x".repeat(100),
    })).toThrowError(expect.objectContaining({ code: "AI_HISTORY_CAPACITY_EXCEEDED" }));
  });
});

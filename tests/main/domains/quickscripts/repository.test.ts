import { describe, expect, it } from "vitest";
import { AesGcmFieldCipher } from "../../../../src/main/domains/inventory/field-cipher";
import { openAiDatabase } from "../../../../src/main/domains/ai/database";
import { QuickScriptRepository } from "../../../../src/main/domains/quickscripts/repository";

function createRepository(): QuickScriptRepository {
  return new QuickScriptRepository(openAiDatabase(":memory:"), new AesGcmFieldCipher(Buffer.alloc(32, 9)));
}

const item = (title: string, script: string, confidence = 0.9) => ({
  title,
  script,
  description: null,
  riskHint: null,
  confidence,
});

describe("QuickScriptRepository", () => {
  it("stores scripts encrypted at rest and lists them sorted", () => {
    const repository = createRepository();
    repository.mergeGenerated("host-1", "session-1", [
      item("Low", "df -h", 0.5),
      item("Pinned later", "ls", 0.2),
    ], "llm");
    const listed = repository.list("host-1");
    expect(listed.map((row) => row.title)).toEqual(["Low", "Pinned later"]);
    expect(listed[0]).toMatchObject({
      hostId: "host-1",
      sessionId: "session-1",
      script: "df -h",
      status: "suggested",
      isNew: true,
      mode: "llm",
      sourceUsageCount: 0,
    });
  });

  it("ciphertext at rest never contains the script text", () => {
    const database = openAiDatabase(":memory:");
    const repository = new QuickScriptRepository(database, new AesGcmFieldCipher(Buffer.alloc(32, 9)));
    repository.mergeGenerated("host-1", "session-1", [item("Secret op", "shred /dev/sda9")], "rules");
    const rows = database.prepare("SELECT encrypted_script FROM quick_scripts").all() as { encrypted_script: Buffer }[];
    expect(rows.length).toBe(1);
    expect(rows[0].encrypted_script.toString("utf8")).not.toContain("shred");
  });

  it("merge keeps statuses, refreshes stats, marks only new rows, caps pool at 8", () => {
    const repository = createRepository();
    const first = repository.mergeGenerated("host-1", "session-1", [
      item("A", "a"),
      item("B", "b"),
    ], "llm");
    expect(first).toBe(2);
    const [a] = repository.list("host-1");
    repository.update(a.id, { status: "pinned" });

    const second = repository.mergeGenerated("host-1", "session-2", [
      { title: "A2", script: "a ", description: "updated", riskHint: null, confidence: 0.99, sourceUsageCount: 4, sourceSuccessCount: 3 },
      item("C", "c"),
    ], "llm");
    expect(second).toBe(1);
    const listed = repository.list("host-1");
    const refreshed = listed.find((row) => row.script === "a");
    expect(refreshed).toBeDefined(); // matched by normalized script "a"
    expect(refreshed?.title).toBe("A2"); // matched row renamed from incoming title
    expect(refreshed?.description).toBe("updated");
    expect(refreshed?.sourceUsageCount).toBe(4); // stats refreshed from incoming values
    expect(refreshed?.sourceSuccessCount).toBe(3);
    expect(listed.every((row) => row.isNew === false || row.script === "c")).toBe(true);
    expect(listed.find((row) => row.script === "a")?.status).toBe("pinned");

    // A later match without incoming stats keeps the refreshed values (?? match fallback).
    const third = repository.mergeGenerated("host-1", "session-3", [item("A3", "a ")], "llm");
    expect(third).toBe(0);
    const retained = repository.list("host-1").find((row) => row.script === "a");
    expect(retained?.sourceUsageCount).toBe(4);
    expect(retained?.sourceSuccessCount).toBe(3);

    const many = Array.from({ length: 12 }, (_, i) => item(`T${i}`, `cmd-${i}`, 0.1 + i / 100));
    repository.mergeGenerated("host-2", "session-9", many, "rules");
    expect(repository.list("host-2").length).toBe(8);
  });

  it("dismissed scripts survive merges and are excluded from list by default", () => {
    const repository = createRepository();
    repository.mergeGenerated("host-1", "session-1", [item("A", "a")], "llm");
    const [row] = repository.list("host-1");
    repository.update(row.id, { status: "dismissed" });
    expect(repository.list("host-1")).toEqual([]);
    repository.mergeGenerated("host-1", "session-2", [item("A again", "a")], "llm");
    expect(repository.list("host-1")).toEqual([]);
    expect(repository.list("host-1", true).length).toBe(1);
  });

  it("update can edit title/script and recording execution clears isNew", () => {
    const repository = createRepository();
    repository.mergeGenerated("host-1", "session-1", [item("A", "a")], "llm");
    const [row] = repository.list("host-1");
    const edited = repository.update(row.id, { title: "Renamed", script: "a --verbose" });
    expect(edited.title).toBe("Renamed");
    const executed = repository.update(row.id, { executedCount: 1 });
    expect(executed.executedCount).toBe(1);
    expect(executed.isNew).toBe(false);
  });

  it("delete, deleteForHost, and clearAll remove rows", () => {
    const repository = createRepository();
    repository.mergeGenerated("host-1", "session-1", [item("A", "a")], "llm");
    repository.mergeGenerated("host-2", "session-1", [item("B", "b")], "llm");
    const [host1Row] = repository.list("host-1");
    repository.delete(host1Row.id);
    expect(repository.list("host-1")).toEqual([]);
    repository.deleteForHost("host-2");
    expect(repository.list("host-2")).toEqual([]);
    repository.mergeGenerated("host-3", "s", [item("C", "c")], "llm");
    repository.clearAll();
    expect(repository.list("host-3")).toEqual([]);
  });
});

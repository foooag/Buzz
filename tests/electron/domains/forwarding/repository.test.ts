import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ForwardingRepository,
  type PortForwardRuleRecord,
} from "../../../../electron/domains/forwarding/repository";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Electron forwarding repository", () => {
  it("creates, lists, updates, and deletes rules with stable timestamps", () => {
    const repository = openRepository();
    const created = repository.createRule(rule({ id: "" }), "2026-08-05T01:00:00.000Z");

    expect(created.id).not.toBe("");
    expect(repository.listForHost("host-1")).toEqual([created]);

    const updated = repository.updateRule(
      { ...created, bindPort: 9000, label: "Updated" },
      "2026-08-05T02:00:00.000Z",
    );
    expect(updated.createdAt).toBe(created.createdAt);
    expect(repository.listForHost("host-1")).toEqual([updated]);

    repository.delete(updated.id);
    expect(repository.listForHost("host-1")).toEqual([]);
    expect(() => repository.delete(updated.id)).toThrowError(
      expect.objectContaining({ code: "PORT_FORWARD_NOT_FOUND" }),
    );
    repository.close();
  });

  it("rejects invalid local and dynamic rules before writing", () => {
    const repository = openRepository();
    for (const invalid of [
      rule({ bindPort: 0 }),
      rule({ targetHost: null }),
      rule({ kind: "dynamic", targetHost: null, targetPort: 70_000 }),
    ]) {
      expect(() => repository.create(invalid)).toThrowError(
        expect.objectContaining({ code: "PORT_FORWARD_INVALID_RULE" }),
      );
    }
    expect(repository.listForHost("host-1")).toEqual([]);
    repository.close();
  });

  it("persists rules across reopen", () => {
    const directory = temporaryDirectory();
    const databasePath = path.join(directory, "forwarding.sqlite3");
    const first = ForwardingRepository.open(databasePath);
    const created = first.createRule(rule(), "2026-08-05T01:00:00.000Z");
    first.close();

    const reopened = ForwardingRepository.open(databasePath);
    expect(reopened.listForHost("host-1")).toEqual([created]);
    reopened.close();
  });
});

function rule(overrides: Partial<PortForwardRuleRecord> = {}): PortForwardRuleRecord {
  return {
    id: "rule-1",
    hostId: "host-1",
    kind: "local",
    bindHost: "127.0.0.1",
    bindPort: 8080,
    targetHost: "remote.internal",
    targetPort: 80,
    label: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function openRepository(): ForwardingRepository {
  return ForwardingRepository.open(
    path.join(temporaryDirectory(), "forwarding.sqlite3"),
  );
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-electron-forwarding-"));
  temporaryDirectories.push(directory);
  return directory;
}

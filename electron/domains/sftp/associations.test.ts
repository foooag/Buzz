import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SftpAssociations } from "./associations";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Electron SFTP file associations", () => {
  it("sets, gets, orders, updates, and idempotently deletes associations", () => {
    const store = openStore();
    expect(store.list()).toEqual([]);
    expect(store.get("csv")).toBeNull();

    const csv = store.set(
      "csv",
      "/System/Applications/Numbers.app",
      "Numbers",
      "2026-08-05T01:00:00.000Z",
    );
    store.set(
      "txt",
      "/System/Applications/TextEdit.app",
      "TextEdit",
      "2026-08-05T01:01:00.000Z",
    );
    expect(store.get("csv")).toEqual(csv);
    expect(store.list().map(({ extension }) => extension)).toEqual(["csv", "txt"]);

    const updated = store.set(
      "csv",
      "/Applications/Other.app",
      "Other",
      "2026-08-05T02:00:00.000Z",
    );
    expect(store.get("csv")).toEqual(updated);
    expect(store.list()).toHaveLength(2);

    store.delete("csv");
    store.delete("csv");
    expect(store.get("csv")).toBeNull();
    store.close();
  });

  it("persists associations across reopen", () => {
    const directory = temporaryDirectory();
    const databasePath = path.join(directory, "sftp.sqlite3");
    const first = SftpAssociations.open(databasePath);
    const association = first.set(
      "log",
      "/Applications/Console.app",
      "Console",
      "2026-08-05T01:00:00.000Z",
    );
    first.close();

    const reopened = SftpAssociations.open(databasePath);
    expect(reopened.list()).toEqual([association]);
    reopened.close();
  });

  it("rejects incomplete associations without leaking database diagnostics", () => {
    const store = openStore();
    expect(() => store.set("", "/Applications/Test.app", "Test"))
      .toThrowError(expect.objectContaining({ code: "SFTP_LOCAL_FS_DENIED" }));
    store.close();
  });
});

function openStore(): SftpAssociations {
  return SftpAssociations.open(path.join(temporaryDirectory(), "sftp.sqlite3"));
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-electron-sftp-assoc-"));
  temporaryDirectories.push(directory);
  return directory;
}

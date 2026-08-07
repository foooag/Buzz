import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  confineUnder,
  safeRelativePathComponents,
  sanitizeFilename,
} from "../../../../src/main/domains/sftp/path-safety";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Electron SFTP path safety", () => {
  it("accepts and trims a clean filename", () => {
    expect(sanitizeFilename("  report.csv  ")).toBe("report.csv");
  });

  it("rejects traversal, separators, NUL, and empty components", () => {
    for (const value of [
      "../authorized_keys",
      "a/b",
      "a\\b",
      "a\0b",
      "",
      ".",
      "..",
    ]) {
      expect(() => sanitizeFilename(value)).toThrowError(
        expect.objectContaining({ code: "SFTP_PATH_INVALID" }),
      );
    }
  });

  it("splits and validates every relative path component", () => {
    expect(safeRelativePathComponents("sub/dir/file.txt"))
      .toEqual(["sub", "dir", "file.txt"]);
    for (const value of ["a/./b", "a/../b", "a//b"]) {
      expect(() => safeRelativePathComponents(value)).toThrowError(
        expect.objectContaining({ code: "SFTP_PATH_INVALID" }),
      );
    }
  });

  it("confines nested paths and rejects absolute or escaping inputs", () => {
    const root = temporaryDirectory();
    mkdirSync(path.join(root, "sub", "dir"), { recursive: true });
    expect(confineUnder(root, "sub/dir/file.txt"))
      .toBe(path.join(realpathSync(root), "sub", "dir", "file.txt"));
    for (const value of ["../../etc/passwd", "sub/../../etc/passwd", "/etc/passwd"]) {
      expect(() => confineUnder(root, value)).toThrowError(
        expect.objectContaining({ code: "SFTP_PATH_INVALID" }),
      );
    }
  });

  it("rejects writes through a symlinked parent outside the chosen root", () => {
    if (process.platform === "win32") return;
    const base = temporaryDirectory();
    const root = path.join(base, "root");
    const outside = path.join(base, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    symlinkSync(outside, path.join(root, "escape"), "dir");

    expect(() => confineUnder(root, "escape/file.txt")).toThrowError(
      expect.objectContaining({ code: "SFTP_PATH_INVALID" }),
    );
  });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-electron-path-"));
  temporaryDirectories.push(directory);
  return directory;
}

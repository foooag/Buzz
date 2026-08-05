import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commitStaging,
  listLocal,
  stagingPathFor,
  streamLocalTo,
} from "../../../../electron/domains/sftp/local-files";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Electron SFTP local filesystem", () => {
  it("lists sorted entries and hides dotfiles unless requested", () => {
    const directory = temporaryDirectory();
    writeFileSync(path.join(directory, "visible.txt"), "hello");
    writeFileSync(path.join(directory, ".hidden"), "secret");
    mkdirSync(path.join(directory, "subdir"));

    const visible = listLocal(directory, false);
    expect(visible.map(({ name }) => name)).toEqual(["subdir", "visible.txt"]);
    expect(visible.find(({ name }) => name === "visible.txt"))
      .toMatchObject({ isDir: false, size: 5 });
    expect(visible.find(({ name }) => name === "subdir"))
      .toMatchObject({ isDir: true });
    expect(listLocal(directory, true).map(({ name }) => name)).toContain(".hidden");
  });

  it("streams fixed-size chunks and flushes the destination", async () => {
    const directory = temporaryDirectory();
    const file = path.join(directory, "payload.bin");
    writeFileSync(file, Buffer.alloc(100_000, 0x1a));
    const chunks: Buffer[] = [];
    const flush = vi.fn();

    await expect(streamLocalTo(file, {
      write: (chunk) => { chunks.push(Buffer.from(chunk)); },
      flush,
    })).resolves.toBe(100_000);
    expect(Buffer.concat(chunks)).toEqual(Buffer.alloc(100_000, 0x1a));
    expect(flush).toHaveBeenCalledOnce();
  });

  it("creates unique adjacent staging paths and atomically replaces targets", () => {
    const directory = temporaryDirectory();
    const target = path.join(directory, "out.bin");
    writeFileSync(target, "original");
    const first = stagingPathFor(target);
    const second = stagingPathFor(target);
    expect(first).not.toBe(target);
    expect(first).not.toBe(second);
    expect(path.dirname(first)).toBe(directory);

    writeFileSync(first, "new-content");
    commitStaging(first, target);
    expect(readFileSync(target, "utf8")).toBe("new-content");
  });

  it("commits a staged file when the target does not exist", () => {
    const directory = temporaryDirectory();
    const target = path.join(directory, "fresh.bin");
    const staging = stagingPathFor(target);
    writeFileSync(staging, "payload");
    commitStaging(staging, target);
    expect(readFileSync(target, "utf8")).toBe("payload");
  });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "terminus-electron-local-fs-"));
  temporaryDirectories.push(directory);
  return directory;
}

import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error The electron-builder hook is an untyped JavaScript module.
import beforeBuild from "../../electron/before-build.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true })));
});

describe("electron-builder native dependency preparation", () => {
  it("omits optional SSH native accelerators before the standard rebuild", async () => {
    const appDir = await mkdtemp(path.join(os.tmpdir(), "buzz-before-build-"));
    temporaryDirectories.push(appDir);
    const pnpmModules = path.join(appDir, "node_modules", ".pnpm");
    const sshEntry = path.join(pnpmModules, "ssh2@1.17.0", "node_modules");
    const cpuEntry = path.join(pnpmModules, "cpu-features@0.0.10");
    const cryptoBuild = path.join(
      sshEntry,
      "ssh2",
      "lib",
      "protocol",
      "crypto",
      "build",
    );

    await mkdir(path.join(pnpmModules, "node_modules"), { recursive: true });
    await mkdir(sshEntry, { recursive: true });
    await mkdir(cpuEntry, { recursive: true });
    await mkdir(cryptoBuild, { recursive: true });
    await writeFile(path.join(pnpmModules, "node_modules", "cpu-features"), "optional");
    await writeFile(path.join(sshEntry, "cpu-features"), "optional");
    await writeFile(path.join(cryptoBuild, "sshcrypto.node"), "optional");

    await expect(beforeBuild({ appDir })).resolves.toBe(true);
    await expect(stat(cpuEntry)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(sshEntry, "cpu-features"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(cryptoBuild)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

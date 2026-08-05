import { rm } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("dist-electron");
if (path.basename(output) !== "dist-electron") {
  throw new Error("Refusing to clean an unexpected Electron output directory.");
}
await rm(output, { recursive: true, force: true });

import { rm } from "node:fs/promises";
import path from "node:path";

const output = path.resolve("out");
if (path.basename(output) !== "out") {
  throw new Error("Refusing to clean an unexpected Electron output directory.");
}
await rm(output, { recursive: true, force: true });

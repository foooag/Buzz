import { readdir, rm, unlink } from "node:fs/promises";
import path from "node:path";

export default async function omitUnsupportedOptionalNativeModule(context) {
  const pnpmModules = path.join(context.appDir, "node_modules", ".pnpm");
  const links = [
    path.join(context.appDir, "node_modules", "cpu-features"),
    path.join(pnpmModules, "node_modules", "cpu-features"),
  ];

  const entries = await readdir(pnpmModules);
  for (const entry of entries) {
    if (entry.startsWith("ssh2@")) {
      links.push(path.join(pnpmModules, entry, "node_modules", "cpu-features"));
    }
  }

  await Promise.all(links.map(async (link) => {
    try {
      await unlink(link);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }));
  await Promise.all(entries
    .filter((entry) => entry.startsWith("cpu-features@"))
    .map((entry) => rm(path.join(pnpmModules, entry), { force: true, recursive: true })));
  await Promise.all(entries
    .filter((entry) => entry.startsWith("ssh2@"))
    .map((entry) => rm(
      path.join(pnpmModules, entry, "node_modules", "ssh2", "lib", "protocol", "crypto", "build"),
      { force: true, recursive: true },
    )));

  return true;
}

#!/usr/bin/env node
// gather-changes.mjs — release-content scout for the Buzz update skill.
//
// Scans the four signal sources this skill cares about, prints a structured
// Markdown report, and writes it to buzz-page/docs/release-notes-input.md so
// the agent (and /baoyu-design) can read it without re-scanning.
//
// Usage:
//   node .claude/skills/update-readme-and-site/gather-changes.mjs            # auto base
//   node .claude/skills/update-readme-and-site/gather-changes.mjs main       # base = main
//   node .claude/skills/update-readme-and-site/gather-changes.mjs <ref>      # base = any ref
//
// The base ref is how far back to look. Default: the merge-base of HEAD and
// origin/main, i.e. "everything new on this branch". Pass `main` to diff the
// whole branch against main; pass a tag like `v0.0.1-beta.4` to diff a release.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Skill dir is .claude/skills/update-readme-and-site/ ; repo root is three levels up.
const ROOT = join(__dirname, "..", "..", "..");

// --- resolve base ref -------------------------------------------------------
let base = process.argv[2];
if (!base) {
  // Default: merge-base of HEAD and origin/main (what's new on this branch).
  // Falls back to "HEAD~20" if origin/main is missing (shallow / no remote).
  try {
    base = execSync("git merge-base HEAD origin/main", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    base = "HEAD~20";
  }
}

// --- helpers ----------------------------------------------------------------
function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}
function gitLines(args) {
  const out = git(args);
  return out ? out.split("\n").filter(Boolean) : [];
}
function readJSON(path, fallback) {
  try {
    return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
  } catch {
    return fallback;
  }
}
function mtime(path) {
  try {
    return statSync(join(ROOT, path)).mtime.toISOString().slice(0, 10);
  } catch {
    return "?";
  }
}

const baseShort = git(`rev-parse --short ${base}`) || base;
const headShort = git("rev-parse --short HEAD");

// --- 1. docs/features -------------------------------------------------------
const FEATURES_DIR = "docs/features";
const features = existsSync(join(ROOT, FEATURES_DIR))
  ? gitLines(`ls-files --cached --others --exclude-standard ${FEATURES_DIR}`)
      .filter((f) => /\.(md|mdx)$/i.test(f))
  : [];

const featureSummaries = features.map((f) => {
  const rel = f; // already repo-relative
  let title = basename(rel).replace(/\.(md|mdx)$/i, "");
  let blurb = "";
  try {
    const text = readFileSync(join(ROOT, rel), "utf8");
    // First H1 as title, first non-empty paragraph as blurb.
    const h1 = text.match(/^#\s+(.+)$/m);
    if (h1) title = h1[1].trim();
    const para = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("|") && !l.startsWith("-"))
      .find(Boolean);
    if (para) blurb = para.slice(0, 160);
  } catch { /* ignore */ }
  return { rel, title, blurb, mtime: mtime(rel) };
});

// --- 2. designs -------------------------------------------------------------
const DESIGNS_DIR = "designs";
const designDirs = existsSync(join(ROOT, DESIGNS_DIR))
  ? gitLines(`ls-files --cached --others --exclude-standard ${DESIGNS_DIR}`)
      .map((f) => f.split("/")[1])
      .filter(Boolean)
  : [];
const designSet = [...new Set(designDirs)];

// designs changed since base (any file under designs/)
const designsChanged = gitLines(`diff --name-only ${base} HEAD -- ${DESIGNS_DIR}`);
// changed design prototypes = subdirs of designs/ that have a changed .html/.jsx
const designPrototypesChanged = [...new Set(
  designsChanged
    .filter((f) => /\.(html|jsx|tsx)$/i.test(f))
    .map((f) => f.split("/")[1])
    .filter(Boolean)
)];

// Read _d_meta.json subtitles for each design dir (newest version's subtitle).
const designMeta = {};
for (const dir of designSet) {
  const metaPath = join(ROOT, DESIGNS_DIR, dir, "_d_meta.json");
  if (existsSync(metaPath)) {
    const meta = readJSON(`${DESIGNS_DIR}/${dir}/_d_meta.json`, {});
    const subtitles = [];
    for (const [_name, asset] of Object.entries(meta.assets || {})) {
      const v = asset.versions?.[asset.versions.length - 1];
      if (v?.subtitle) subtitles.push(v.subtitle);
    }
    designMeta[dir] = { subtitles, updatedAt: meta.updatedAt };
  }
}

// --- 3. version + resources/icons ------------------------------------------
const pkg = readJSON("package.json", {});
const tags = gitLines("tag --sort=-v:refname").filter((t) => /^v?\d/.test(t));

const ICONS_DIR = "resources/icons";
const iconsChanged = existsSync(join(ROOT, ICONS_DIR))
  ? gitLines(`diff --name-only ${base} HEAD -- ${ICONS_DIR}`)
  : [];
// Headline icon files (the ones README/site reference)
const HEADLINE_ICONS = ["icon.svg", "icon.png", "icon.ico", "icon.icns"];
const headlineIconChanged = HEADLINE_ICONS.filter((name) =>
  iconsChanged.includes(`${ICONS_DIR}/${name}`)
);
const iconFiles = existsSync(join(ROOT, ICONS_DIR))
  ? gitLines(`ls-files --cached --others --exclude-standard ${ICONS_DIR}`)
  : [];

// --- 4. what README currently advertises (so the agent knows what to diff) -
const readmePath = "README.md";
const readme = existsSync(join(ROOT, readmePath)) ? readFileSync(join(ROOT, readmePath), "utf8") : "";
const readmeCapabilityNames = [...readme.matchAll(/^\|\s*`\d+`\s*\|\s*\*\*(.+?)\*\*/gm)].map((m) => m[1].trim());
// README uses <img src="..."> tags for the logo and the product screenshot.
// Ignore badge services (shields.io, github actions) — only local ./ assets matter.
const readmeImgs = [
  ...readme.matchAll(/<img[^>]*\bsrc=["']([^"']+)["'][^>]*alt=["']([^"']*)["']/gi),
]
  .map((m) => ({ src: m[1], alt: m[2] }))
  .filter((img) => img.src.startsWith("./") || img.src.startsWith("../"));

// --- emit report ------------------------------------------------------------
const lines = [];
lines.push(`# Release-content scout — change report`);
lines.push(`Generated for Buzz README + buzz-page site update.`);
lines.push(``);
lines.push(`- **Base ref:** \`${base}\` (${baseShort}) → HEAD ${headShort}`);
lines.push(`- **package.json version:** ${pkg.version || "?"}`);
lines.push(`- **Latest git tags:** ${tags.slice(0, 4).join(", ") || "(none)"}`);
lines.push(`- **Scanned:** ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`);
lines.push(``);

lines.push(`## 1 · Feature docs (docs/features/)`);
lines.push(``);
if (featureSummaries.length === 0) {
  lines.push(`> No markdown feature docs found under docs/features/. Nothing to summarize. If a feature shipped, add a doc there first.`);
} else {
  for (const f of featureSummaries) {
    lines.push(`### ${f.title}`);
    lines.push(`- path: \`${f.rel}\`  (modified ${f.mtime})`);
    if (f.blurb) lines.push(`- summary: ${f.blurb}`);
  }
}
lines.push(``);

lines.push(`## 2 · Prototype designs (designs/)`);
lines.push(``);
lines.push(`Design prototypes present: ${designSet.length ? designSet.join(", ") : "(none)"}`);
lines.push(``);
if (designsChanged.length) {
  lines.push(`Files changed since base:`);
  for (const f of designsChanged) lines.push(`- \`${f}\``);
} else {
  lines.push(`> No design files changed since base. To force a full review, run with \`main\` or a tag: \`node …/gather-changes.mjs main\`.`);
}
lines.push(``);
if (designPrototypesChanged.length) {
  lines.push(`Prototypes with changed markup: ${designPrototypesChanged.join(", ")}`);
  lines.push(``);
}
for (const [dir, meta] of Object.entries(designMeta)) {
  lines.push(`### designs/${dir}`);
  if (meta.updatedAt) lines.push(`- meta updatedAt: ${meta.updatedAt}`);
  for (const s of meta.subtitles) lines.push(`- latest version note: ${s}`);
  lines.push(``);
}

lines.push(`## 3 · Version & icons (resources/icons/)`);
lines.push(``);
lines.push(`- Current package version: **${pkg.version || "?"}**`);
lines.push(`- Recent tags: ${tags.slice(0, 6).join(", ") || "(no version tags yet)"}`);
lines.push(`- Tracked icon files: ${iconFiles.length}`);
if (headlineIconChanged.length) {
  lines.push(`- ⚠️ Headline icons changed since base: **${headlineIconChanged.join(", ")}** — README/site/asset copy may need to re-reference them.`);
} else {
  lines.push(`- Headline icons (icon.svg/.png/.ico/.icns) unchanged since base.`);
}
if (iconsChanged.length) {
  lines.push(``);
  lines.push(`All icon changes:`);
  for (const f of iconsChanged) lines.push(`- \`${f}\``);
}
lines.push(``);

lines.push(`## 4 · README.md — what it currently advertises`);
lines.push(``);
lines.push(`- Capability rows in README: ${readmeCapabilityNames.length ? readmeCapabilityNames.join(", ") : "(none parsed)"}`);
if (readmeImgs.length) {
  lines.push(`- Images referenced by README:`);
  for (const img of readmeImgs) lines.push(`  - \`${img.src}\`  ${img.alt ? `— ${img.alt}` : ""}`);
} else {
  lines.push(`- Images referenced by README: (none)`);
}
lines.push(``);
lines.push(`Use this as the diff baseline. The README update step adds rows/copy for anything in §1 that isn't already a capability above, and re-points a screenshot image if a design preview changed.`);

// --- write + print ----------------------------------------------------------
const outDir = join(ROOT, "buzz-page", "docs");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "release-notes-input.md");
writeFileSync(outPath, lines.join("\n") + "\n");

process.stdout.write(lines.join("\n") + "\n");
process.stderr.write(`\n[wrote ${outPath}]\n`);

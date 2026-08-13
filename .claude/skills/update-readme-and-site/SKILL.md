---
name: update-readme-and-site
description: >-
  Keep README.md and the buzz-page/ marketing site in sync with what actually
  shipped. Summarize new docs/features, review prototype changes in designs/,
  bump version/icon references, write the highlights into README.md, then drive
  a design refresh of buzz-page/site/ via the baoyu-design skill against the
  docs/DESIGN.md system. Use when asked to "update the README", "refresh the
  landing page", "update the official website", "summarize new features for the
  site", or cut release notes content from recent work.
---

# Update README + official site (buzz-page)

This skill produces **release content** for two surfaces that must stay in sync with the shipped product:

1. `README.md` — the repo's canonical feature/capability + screenshot reference.
2. `buzz-page/site/` — the static marketing site (deployed to GitHub Pages → `buzz.nex.show`) that mirrors those capabilities visually.

It is **not** a "launch the app" skill. The deliverable is updated prose + HTML, driven by a change-scout script and the `/baoyu-design` skill. Design fidelity is bound to `docs/DESIGN.md`.

## What this is for

When features ship, three things drift out of date: the feature list in the README, the screenshots those docs reference, and the marketing site's copy/sections. This skill closes that loop from git history to published page:

- **§1 features** → new capability rows / copy in README, new sections on the site
- **§2 designs** → prototype changes inform what the site should show
- **§3 version + icons** → README badges/version line and site asset references stay correct
- **§4 README baseline** → the diff the agent writes against
- Then `/baoyu-design` rebuilds the relevant `buzz-page/site/` sections under the `docs/DESIGN.md` system.

## Prerequisites

- Node.js (any 18+; repo runs on 22+). Check: `node --version`.
- Python 3, for previewing the static site: `python3 -m http.server` (used in the verify step).
- The `/baoyu-design` skill installed (`~/.claude/skills/baoyu-design/SKILL.md`). It is invoked by name in step 5.
- No build step for `buzz-page/site/` — it is plain static HTML/CSS/JS served as-is.

## Run (agent path)

Work from the repo root (`/Users/gaoooof/Documents/code/Buzz`). Paths below are relative to the repo root unless noted; the driver lives at `.claude/skills/update-readme-and-site/gather-changes.mjs`.

### Step 1 — Scout what changed

Run the change-scout driver. It scans the four signal sources and writes a structured report to `buzz-page/docs/release-notes-input.md` (and prints it):

```bash
node .claude/skills/update-readme-and-site/gather-changes.mjs main
```

The argument is the **base ref** — how far back to look:

- `main` → diff the whole current branch against `main` (use when summarizing a batch of work).
- A version tag, e.g. `v0.0.1-beta.4` → diff since that release (use when cutting release notes for a specific tag).
- No argument → `merge-base HEAD origin/main` (just this branch's new commits; falls back to `HEAD~20` with no remote).

Read the printed report. It has four sections that map 1:1 to the rest of the workflow:

| Section | Source | What to do with it |
| --- | --- | --- |
| §1 Feature docs | `docs/features/*.md` | Each doc's first H1 + first paragraph is pre-extracted. These become README capability rows and site sections. |
| §2 Prototype designs | `designs/` + each `_d_meta.json` | Lists changed `.html/.jsx` and the latest version subtitle per design dir. Informs site visuals. |
| §3 Version & icons | `package.json`, `git tag`, `resources/icons/` | Flags headline icon changes (`icon.svg/.png/.ico/.icns`) and prints current version + tags. |
| §4 README baseline | `README.md` | Parses the capability rows and local `<img>` refs already in README — this is the diff baseline. |

### Step 2 — Summarize §1 features for prose

For each feature doc in §1, write a one-line capability entry matching README's existing row shape (`| \`NN\` | **Name** | One-sentence benefit. |`). The scout already gives you title + blurb; tighten the blurb to the README's voice and renumber sequentially. Skip any capability that already appears in the §4 baseline list.

If §1 is empty ("No markdown feature docs found"), there is nothing to add — say so and move on. **Do not invent capabilities.** If you know a feature shipped but has no doc, ask the user to add `docs/features/<name>.md` first (the scout only reads docs that exist).

### Step 3 — Review §2 designs

Open the changed prototype files (the report lists them) and the latest `_d_meta.json` subtitle. Note: does the prototype show a **new UI surface** (e.g. a new panel, flow, or screen) that the marketing site currently doesn't reflect? Those become site-section candidates for step 5.

The site already mirrors `designs/terminal-ai-mode/` (the hero app-window mock + the Ask/Inspect/Act flow). New prototypes or major changes there are the highest-signal input to step 5.

### Step 4 — Write the README update

Edit `README.md` using the §4 baseline as your before-state:

- **Capabilities table** (the `## One workspace…` table): append/insert the new rows from step 2, keeping the two-column index sequence. Keep the exact cell format (`| \`NN\` | **Name** | … |`).
- **Version line**: §3 reports the current `package.json` version and recent tags. If the README implies a stale version (it currently has none — version lives in badges/Releases), leave it. Do not hard-code a version into prose; the Release badges already cover it.
- **Screenshots**: §3 flags if a headline icon changed. The README's product screenshot is `./designs/terminal-ai-mode/sftp-preview.png` (listed in §4). Only re-point it if a new preview PNG was actually produced; otherwise leave the path.
- **Security / capability copy**: only touch if §1 or §2 surfaces a genuinely new security posture or capability — otherwise this section is stable.

Keep the README's existing voice: terse, capability-first, the security-by-design bullets unchanged unless they're factually wrong now.

### Step 5 — Refresh buzz-page/site/ via /baoyu-design

This step redesigns marketing surfaces to match the README + feature delta, under the `docs/DESIGN.md` design system. Invoke the design skill with explicit context so it doesn't freehand:

```
/baoyu-design
```

In the prompt you hand it, include:

1. **Scope**: edit the existing files in `buzz-page/site/` (`index.html`, `styles.css`, `script.js`) — this is a refresh of a live site, not a greenfield build. The site is static and deploys from `buzz-page/site/` as-is (see `.github/workflows/deploy-pages.yml`).
2. **Source of truth for content**: `README.md` (the capabilities you just updated) + `buzz-page/docs/release-notes-input.md` (the scout report). The site must mirror the README's capability set, not invent new ones.
3. **Binding design system**: `docs/DESIGN.md` — Linear-style midnight system: void `#08090a` canvas, acid-lime `#e4f222` as the *single* chromatic CTA, hairline `#23252a` borders instead of shadows, Inter Variable 400–510 weights (no 700+), 12px card / 6px button / 9999px pill radii. `buzz-page/site/styles.css` already encodes these tokens — extend, don't replace.
4. **What to change**: the concrete deltas from §1/§2 — new capability cards, a new section for a new surface, updated copy. Don't redesign sections that didn't change.
5. **Constraints from the system**: one acid-lime CTA per view, product-screenshot-first imagery (no stock), max-width 1200px, 96px section gaps.

The `/baoyu-design` skill will read its own methodology (`~/.claude/skills/baoyu-design/SKILL.md` → `system-prompt.md` + the Claude Code harness reference) and apply `docs/DESIGN.md` as the binding visual constraint. Let it produce/iterate the HTML; do not hand-write raw CSS unless it asks for a specific value.

### Step 6 — Verify the site locally

Preview the static site and confirm the refreshed sections render. From the repo root:

```bash
cd buzz-page/site && python3 -m http.server 1421
```

Open `http://localhost:1421/` in a browser. Confirm: capability list matches README, new sections appear, the acid-lime CTA is the only chromatic action, no broken images (paths under `./assets/` and any new screenshot refs resolve). Stop the server with `Ctrl-C` when done.

### Step 7 — Commit

Commit README + `buzz-page/site/` together with a message describing the content delta, e.g. `docs(site): sync README and landing page with <feature>`. Do **not** commit the scratch report at `buzz-page/docs/release-notes-input.md` unless the user wants it kept — it's a working artifact. The Pages deploy triggers automatically on push to `main` for `buzz-page/**` changes (see the workflow's `paths:` filter).

## Run (human path)

If you just want the report without touching files: run step 1 only and read stdout. Everything else is an edit pass driven by that report.

## Gotchas

- **`docs/features/` is currently empty.** As of writing there are no feature docs, so §1 reports nothing. The scout is designed for when docs *are* added — it reads `docs/features/*.md(x)`, extracts H1 + first paragraph. If a feature shipped but has no doc, the scout can't see it; add the doc first.
- **The README uses `<img src="…">` tags, not markdown images**, for both the logo and the product screenshot. The scout parses these specifically (ignoring shields.io/GitHub badge services) and reports only local `./`-prefixed assets. Don't expect `![](...)` syntax.
- **Version is `0.0.1` in package.json; released betas are `v0.0.1-beta.N` tags.** Don't "fix" the README to a beta tag — releases are badge-driven. The scout reports both so you can spot a mismatch, but no action is needed unless a tag/version is genuinely wrong.
- **`buzz-page/site/` has no build step and no package.json.** It is served verbatim by the Pages workflow (`path: buzz-page/site`). Any "build" command for the site does not exist — edits land directly in `index.html` / `styles.css` / `script.js`.
- **`/baoyu-design` generates self-contained HTML artifacts by default.** For this site you want it to *edit the existing split files*, not produce a standalone artifact. State that explicitly in its prompt (step 5 item 1) or it will hand you a single throwaway HTML file instead of updating the deployed site.
- **The site already implements `docs/DESIGN.md`.** `styles.css` uses the void/acid-lime/graphite palette and the 12/6/pill radii. A refresh should extend these tokens for new sections, not introduce new colors or radii — the system is strict (one CTA color, no 700+ weights, hairline borders over shadows).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `git merge-base HEAD origin/main` fails / scout falls back to `HEAD~20` | No `origin/main` locally. Run with an explicit base: `node …/gather-changes.mjs main` (or `v0.0.1-beta.4`). |
| Scout reports "No design files changed since base" but you expect changes | The base ref is too recent. Re-run with an older base (`main`, or the previous tag). The `updatedAt` in each design's `_d_meta.json` is the source of truth for when a prototype last changed. |
| §4 lists badges as images | It shouldn't — badges (shields.io, github.com/…/badge.svg) are filtered out. If you see them, the filter in `gather-changes.mjs` (`.filter(img => src starts with ./ or ../)`) needs the badge host added. |
| `python3 -m http.server` port busy | Use a different port: `python3 -m http.server 1422`. |
| Pages didn't redeploy after commit | The workflow only fires on `buzz-page/**` or `.github/workflows/deploy-pages.yml` paths touching `main`. A README-only commit won't trigger it; a `buzz-page/site/**` commit will. |

## Files this skill touches

- **Reads:** `README.md`, `docs/features/*.md(x)`, `designs/**/_d_meta.json` + changed `.html/.jsx`, `package.json`, `resources/icons/`, `docs/DESIGN.md`, `buzz-page/site/*`.
- **Writes:** `README.md`, `buzz-page/site/index.html` + `styles.css` + `script.js` (via `/baoyu-design`), and the scratch report `buzz-page/docs/release-notes-input.md` (working artifact; safe to delete or `.gitignore`).
- **Driver:** `.claude/skills/update-readme-and-site/gather-changes.mjs` — the change scout. Standalone Node script, no dependencies, no side effects beyond writing the scratch report.

# NOTES — authoring log for the update-readme-and-site skill

Scratchpad of what was discovered/disproved while building this skill. The
battle scars that became SKILL.md's Gotchas and Troubleshooting.

## What this unit actually is

This is **not** a "run the app" skill. Buzz itself is an Electron desktop app
(launched via `pnpm dev`, covered by a separate `/run` path). This skill is a
**release-content pipeline**: detect what shipped → update README → refresh the
marketing site via `/baoyu-design`. The "driver" is a change-scout, not a REPL.

Two deliverable surfaces, both already in the repo:
- `README.md` — capability table + screenshot refs + security copy.
- `buzz-page/site/` — static marketing site (`index.html` / `styles.css` /
  `script.js`), deployed to GitHub Pages → `buzz.nex.show` by
  `.github/workflows/deploy-pages.yml` (`path: buzz-page/site`).

## Verified facts (this session, this container)

- `node v24.12.0`, `python3` both present. `chromium`/`chromium-cli` **absent**
  (not needed — static site, no e2e here).
- `package.json` version = **0.0.1**. Git tags: `v0.0.1-beta.{1..4}`. README
  has no hardcoded version line — it's badge/Releases-driven.
- `docs/features/` is **empty** (created Aug 12, no files). §1 of the scout
  correctly reports nothing to summarize. This is the designed empty-state.
- `designs/` has one prototype dir: `terminal-ai-mode/` with `_d_meta.json`
  (updatedAt `2026-08-06`, subtitle about Agent chat history). The site's hero
  mock + Ask/Inspect/Act flow already mirrors it.
- `buzz-page/site/` has **no package.json, no build step** — pure static.
  `styles.css` already uses the DESIGN.md palette (grep found
  `#e4f222`/`#08090a`/`#23252a`/`#d0d6e0`).
- README product screenshot = `./designs/terminal-ai-mode/sftp-preview.png`
  (via an `<img>` tag, **not** markdown image syntax).

## Bugs hit in the driver and fixed

1. **First screenshot regex matched nothing.** README uses
   `<img src="./designs/terminal-ai-mode/sftp-preview.png">`, but the initial
   regex `!\[.*?\]\((\.\/?[^)]+)\)` only matched markdown `![]()` images.
   Fixed: also parse `<img src=…>`.

2. **Then the `<img>` regex matched the badge services** (shields.io,
   github.com/…/badge.svg) because those are `<img>` tags too, polluting the
   "images referenced by README" list with 4 badges. Fixed: filter to only
   local `./`- and `../`-prefixed srcs. Now reports just the logo + the
   product screenshot — the two a content update actually cares about.

3. **Empty-state UX.** When §1 has no docs, the scout said nothing useful.
   Added an explicit "> No markdown feature docs found…" note pointing the
   agent to add a doc first, so a future agent doesn't fabricate features.

## Self-test run (proof the driver works with real content)

Created a temp `docs/features/_scout_selftest.md`, ran the scout against
`HEAD~6`, confirmed it extracted:
- title = "Command Palette (cmdk)" (from H1)
- blurb = first paragraph, truncated to 160 chars
Then deleted the temp file. Output for a populated §1 is correct. Final
verified run (this repo, today):

```
## 1 · Feature docs — empty (correct)
## 2 · designs/terminal-ai-mode — updatedAt + subtitle
## 3 · version 0.0.1, tags beta.1..4, 13 icons, headline icons unchanged
## 4 · README capabilities: Local terminals, Remote SSH, SFTP, Port forwarding,
     AI shell agent, Encrypted vault
     images: ./resources/icons/icon.svg (logo),
             ./designs/terminal-ai-mode/sftp-preview.png (screenshot)
```

Exit codes verified: default-base = 0, `main`-base = 0.

## Why /baoyu-design is delegated (not reimplemented)

The marketing refresh needs real design craft under the DESIGN.md system.
`/baoyu-design` already exists (`~/.claude/skills/baoyu-design/`), reads
`system-prompt.md`, supports consuming an existing design system
(`built-in-skills/use-design-system.md`), and produces self-contained HTML.
This skill's job is to **hand it the right scope + binding system + content
source** (README + scout report), not to redo design methodology. Key gotcha
captured in SKILL.md: tell baoyu-design to *edit the existing split files*,
or it returns one throwaway standalone HTML file instead of updating the
deployed site.

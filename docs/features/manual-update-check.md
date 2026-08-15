# Manual Update Check

The Preferences sidebar's Changelog area offers a Check for updates button so users can trigger a version check on demand instead of waiting for the startup probe.

## What it does

Clicking Check for updates calls the updater API. While running, the button shows a spinner with Checking…; the outcome is Up to date, Check failed — try again on error, or a version badge (e.g. Buzz 0.2.0 is available) plus the existing update dialog with release notes, download progress, and restart flow.

## How to use

Open Preferences and click Check for updates next to the Changelog label in the sidebar footer. When an update is found, the standard update dialog opens with Update now / Later actions.

## Where it lives

- `src/renderer/features/settings/PreferencesWindow.tsx` — ChangelogSection
- `src/renderer/features/updater/UpdateDialog.tsx` — shared dialog with `initialUpdate` prop
- `src/renderer/features/updater/updaterApi.ts`
- Main-process IPC: `terminus:update:check` in `src/main/index.ts` (returns `null` in unpackaged dev builds)

## Security notes

Update checks only run through the existing sandboxed IPC bridge; no new commands cross the boundary.

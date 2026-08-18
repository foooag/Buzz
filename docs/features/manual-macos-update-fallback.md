# Manual macOS update fallback

Buzz detects unsigned or ad-hoc-signed macOS builds and switches update installs to a manual DMG flow, because Squirrel.Mac cannot auto-update an app without a valid code signature.

## What it does

- On startup update checks, the main process runs `codesign -dv` against the running `.app` bundle (once per session, packaged builds only).
- When the signature is missing or ad-hoc, the background updater downloads the release DMG instead of the Squirrel zip, reporting the same download progress in the sidebar.
- The status action becomes "Open installer". Selecting it mounts and opens the DMG, then Buzz shows a dialog asking the user to drag Buzz into the Applications folder and reopen it.
- Signed builds keep the automatic quit-and-install flow unchanged.

## How to use

Wait for the download to finish, then select "Open installer" next to Local vault and drag Buzz over the old copy in Applications when the Finder window opens. Signed builds keep using "Restart to update".

## Where it lives

- Signature detection and manual-update state machine: `src/main/updater.ts`
- DMG download, mount, and relaunch wiring: `src/main/index.ts`
- Sidebar status control and manual-update dialog: `src/renderer/features/updater/UpdateStatusControl.tsx`

## Security notes

The DMG URL is derived from the same GitHub release that electron-updater verified (the published `latest-mac.yml` zip URL), the file is downloaded by the main process only, and the renderer only receives phase and progress state through the sandboxed preload bridge. No vault data or credentials are involved.

# Background client updates

Buzz now downloads available client updates silently and keeps the user in control of when the application restarts.

## What it does

- Checks for a new packaged release without interrupting startup.
- Downloads an available release in the background and shows progress beside Local vault.
- Changes the status action to Restart to update after the download is ready.
- Closes active runtimes and hands control directly to the platform installer when the user restarts.
- Offers an inline retry if the background download fails.

## How to use

Keep working while the download icon is visible. When it changes to Restart to update, select it to close Buzz, install the release, and relaunch the client.

## Where it lives

- Main-process update state and download orchestration: `src/main/updater.ts`
- Graceful install restart coordination: `src/main/shutdown.ts`
- Sandboxed update bridge: `src/preload/index.cjs`
- Sidebar status control: `src/renderer/features/updater/UpdateStatusControl.tsx`

## Security notes

Update checks, downloads, and installer execution remain in the Electron main process. The renderer receives only version and progress state through the sandboxed preload bridge.

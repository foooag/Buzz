# Releasing Buzz

Buzz packages Electron installers with `electron-builder` and publishes
the platform update metadata consumed by `electron-updater` to GitHub Releases.

## Signing setup

Configure these GitHub Actions secrets before publishing production builds:

- `CSC_LINK` and `CSC_KEY_PASSWORD` for the macOS Developer ID certificate.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` for macOS notarization.
- `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` for the Windows code-signing certificate.

Never commit signing certificates or passwords. Existing installations trust
future updates through the operating system's code-signing identity, so keep
the certificates and renewal process backed up securely.

## Publish a release

Create and push a SemVer tag:

```sh
git tag v0.2.0
git push origin v0.2.0
```

The release workflow builds a universal macOS application, Linux x64 packages,
and a Windows x64 installer. It publishes installers plus `latest*.yml` update
metadata to the tagged GitHub Release. Prerelease tags such as
`v0.2.0-beta.1` are marked as prereleases and do not replace the stable channel.

For a local unsigned package, run `pnpm package`; the script builds the renderer
and Electron main process before invoking `electron-builder`.

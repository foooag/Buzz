import { describe, expect, it } from "vitest";
import { getAvailableUpdateMetadata } from "../../src/main/updater";

describe("desktop updater", () => {
  it("does not expose metadata when electron-updater reports no update", () => {
    expect(
      getAvailableUpdateMetadata({
        isUpdateAvailable: false,
        updateInfo: {
          version: "0.0.1-beta.6",
          releaseDate: "2026-08-15T00:00:00.000Z",
          releaseNotes: "Already installed.",
        },
      }),
    ).toBeNull();
  });

  it("returns available metadata and combines changelog entries", () => {
    expect(
      getAvailableUpdateMetadata({
        isUpdateAvailable: true,
        updateInfo: {
          version: "0.0.1-beta.7",
          releaseNotes: [
            { note: "<h2>What's Changed</h2>" },
            { note: "<ul><li>Updater fix</li></ul>" },
          ],
        },
      }),
    ).toEqual({
      version: "0.0.1-beta.7",
      body: "<h2>What's Changed</h2>\n\n<ul><li>Updater fix</li></ul>",
    });
  });
});

export type AvailableUpdateMetadata = {
  version: string;
  date?: string;
  body?: string;
};

type ReleaseNote = {
  note?: string | null;
};

type UpdateCheckResult = {
  isUpdateAvailable: boolean;
  updateInfo: {
    version: string;
    releaseDate?: string;
    releaseNotes?: string | readonly ReleaseNote[] | null;
  };
};

export function getAvailableUpdateMetadata(
  result: UpdateCheckResult | null,
): AvailableUpdateMetadata | null {
  if (!result?.isUpdateAvailable) return null;

  const body = formatReleaseNotes(result.updateInfo.releaseNotes);
  return {
    version: result.updateInfo.version,
    date: result.updateInfo.releaseDate,
    ...(body ? { body } : {}),
  };
}

function formatReleaseNotes(
  releaseNotes: UpdateCheckResult["updateInfo"]["releaseNotes"],
): string | undefined {
  if (typeof releaseNotes === "string") {
    return releaseNotes.trim() || undefined;
  }
  if (!releaseNotes) return undefined;

  const notes = releaseNotes
    .map((release) => release.note?.trim())
    .filter((note): note is string => Boolean(note));
  return notes.length > 0 ? notes.join("\n\n") : undefined;
}

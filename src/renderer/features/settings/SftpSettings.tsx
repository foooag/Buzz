import { useState } from "react";
import type { Association } from "../sftp/sftpTypes";

type SftpSettingsProps = {
  associations: Association[];
  /**
   * Remove an association by extension. Destructive: the panel confirms via a
   * per-row affordance before invoking this so deletions are never accidental.
   */
  onDelete?: (extension: string) => void;
};

/**
 * SFTP file-type associations preferences. Renders a table of stored
 * extension → application mappings with an explicit empty-state when no
 * associations exist, and a remove control per row. Deletions require an
 * explicit confirmation step (a per-row "Remove" then a "Confirm" toggle) so
 * destructive actions never fire on a single misclick — mirroring the
 * conflict-dialog's explicit-confirm contract.
 */
export function SftpSettings({ associations, onDelete }: SftpSettingsProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  if (associations.length === 0) {
    return (
      <p className="sftp-settings__empty" data-testid="sftp-settings-empty">
        No file type associations. Open a remote file with the Open-With dialog
        and check “Remember for this file type” to add one.
      </p>
    );
  }

  return (
    <table className="sftp-settings__table" data-testid="sftp-settings-table">
      <caption className="sftp-settings__caption">SFTP file type associations</caption>
      <thead>
        <tr>
          <th scope="col">Extension</th>
          <th scope="col">Application</th>
          <th scope="col">Updated</th>
          <th scope="col"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {associations.map((association) => {
          const isPending = pendingDelete === association.extension;
          return (
            <tr key={association.extension} data-extension={association.extension}>
              <td data-testid="sftp-settings-extension">{association.extension}</td>
              <td>{association.appName}</td>
              <td>{association.updatedAt}</td>
              <td>
                {onDelete ? (
                  isPending ? (
                    <span className="sftp-settings__confirm">
                      <button
                        type="button"
                        aria-label={`Confirm remove ${association.extension} association`}
                        onClick={() => {
                          setPendingDelete(null);
                          onDelete(association.extension);
                        }}
                      >
                        Confirm remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(null)}
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="sftp-settings__remove"
                      aria-label={`Remove ${association.extension} association`}
                      onClick={() => setPendingDelete(association.extension)}
                    >
                      Remove
                    </button>
                  )
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

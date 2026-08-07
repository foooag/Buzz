import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OpenWithDialog } from "@/features/sftp/OpenWithDialog";
import type { SftpApi } from "@/features/sftp/sftpApi";

/**
 * A minimal `SftpApi` stub: only the methods the OpenWithDialog touches are
 * wired (the rest throw so a missing surface surfaces loudly). `openWith` and
 * `setAssociation` are spies so the test can assert the remember-association
 * + launch flow.
 */
function stubApi(overrides: Partial<Pick<SftpApi, "openWith" | "setAssociation" | "listAssociations">> = {}): SftpApi {
  return {
    open: vi.fn(),
    decideHostKey: vi.fn(),
    reconnect: vi.fn(),
    listRemote: vi.fn(),
    listLocal: vi.fn(),
    enqueueUpload: vi.fn(),
    enqueueDownload: vi.fn(),
    resolveConflict: vi.fn(),
    cancelTransfer: vi.fn(),
    deleteRemote: vi.fn(),
    renameRemote: vi.fn(),
    mkdirRemote: vi.fn(),
    openWith: overrides.openWith ?? vi.fn().mockResolvedValue("w1"),
    resolveOpenWithConflict: vi.fn(),
    closeOpenWith: vi.fn(),
    listAssociations: overrides.listAssociations ?? vi.fn().mockResolvedValue([]),
    setAssociation: overrides.setAssociation ?? vi.fn().mockResolvedValue(undefined),
    deleteAssociation: vi.fn(),
    close: vi.fn(),
  } as unknown as SftpApi;
}

describe("OpenWithDialog", () => {
  it("shows the remote file name", () => {
    render(
      <OpenWithDialog
        open
        sessionId="s1"
        remotePath="/home/report.csv"
        api={stubApi()}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("report.csv")).toBeInTheDocument();
  });

  it("remembers an association and calls openWith when Remember is checked", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(
      <OpenWithDialog
        open
        sessionId="s1"
        remotePath="/home/report.csv"
        api={api}
        onClose={() => {}}
      />,
    );
    await user.type(screen.getByLabelText(/application/i), "Numbers");
    await user.click(screen.getByLabelText(/remember for this file type/i));
    await user.click(screen.getByRole("button", { name: /open/i }));

    expect(api.setAssociation).toHaveBeenCalledWith("csv", expect.any(String), "Numbers");
    expect(api.openWith).toHaveBeenCalledWith("s1", "/home/report.csv", expect.any(String));
  });

  it("does not call setAssociation when Remember is unchecked", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(
      <OpenWithDialog
        open
        sessionId="s1"
        remotePath="/home/report.csv"
        api={api}
        onClose={() => {}}
      />,
    );
    await user.type(screen.getByLabelText(/application/i), "Numbers");
    await user.click(screen.getByRole("button", { name: /open/i }));

    expect(api.setAssociation).not.toHaveBeenCalled();
    expect(api.openWith).toHaveBeenCalledWith("s1", "/home/report.csv", "Numbers");
  });

  it("prefills the app from a remembered association for the extension", () => {
    render(
      <OpenWithDialog
        open
        sessionId="s1"
        remotePath="/home/report.csv"
        api={stubApi()}
        associations={[
          { extension: "csv", appPath: "/x", appName: "Numbers", updatedAt: "t" },
        ]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText(/application/i)).toHaveValue("Numbers");
  });
});

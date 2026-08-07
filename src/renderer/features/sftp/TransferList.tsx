import { Button } from "@/components/ui/button";
import type { TransferId } from "./sftpTypes";
import type { TransferView } from "./sftpStore";

type TransferListProps = {
  transfers: TransferView[];
  /** Cancel a transfer; routed to `api.cancelTransfer` by the panel. */
  onCancelTransfer?(transferId: TransferId): void;
};

/**
 * Compact transfer dock. Renders one row per `TransferView` with the
 * direction, an aggregate status (in-progress counts or the final
 * succeeded/failed/skipped summary), and per-item progress bars for active
 * items. Each row carries a Cancel button wired to
 * `api.cancelTransfer(transferId)`.
 *
 * Stateless on purpose: the panel feeds it the store's `transfers` and a
 * cancel callback so the component stays easy to test in isolation.
 */
export function TransferList({ transfers, onCancelTransfer }: TransferListProps) {
  if (transfers.length === 0) {
    return (
      <p className="text-caption text-fog" data-testid="sftp-transfer-list-empty">
        No transfers yet.
      </p>
    );
  }
  return (
    <ul className="grid gap-1.5" data-testid="sftp-transfer-list">
      {transfers.map((transfer) => (
        <TransferRow key={transfer.transferId} transfer={transfer} onCancelTransfer={onCancelTransfer} />
      ))}
    </ul>
  );
}

function TransferRow({
  transfer,
  onCancelTransfer,
}: {
  transfer: TransferView;
  onCancelTransfer?: (transferId: TransferId) => void;
}) {
  const itemViews = Object.values(transfer.items);
  const active = itemViews.filter((item) => item.status === "active").length;
  const done = itemViews.filter((item) => item.status === "done").length;
  const failed = itemViews.filter((item) => item.status === "failed").length;
  const completed = Boolean(transfer.summary);

  return (
    <li
      className="grid gap-1"
      data-testid="sftp-transfer-row"
      data-transfer-id={transfer.transferId}
      data-direction={transfer.direction}
      data-completed={completed ? "true" : "false"}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
        <span className="font-w510 text-mist">
          {transfer.direction === "upload" ? "Upload" : "Download"}
        </span>
        {completed && transfer.summary ? (
          <span className="text-fog" data-testid="sftp-transfer-summary-text">
            succeeded {transfer.summary.succeeded}, failed {transfer.summary.failed}, skipped{" "}
            {transfer.summary.skipped}
          </span>
        ) : (
          <span className="text-fog" data-testid="sftp-transfer-progress-text">
            {itemViews.length === 0
              ? `${transfer.itemCount} item${transfer.itemCount === 1 ? "" : "s"} queued`
              : `${done} done, ${active} active${failed > 0 ? `, ${failed} failed` : ""}`}
          </span>
        )}
        {onCancelTransfer && !completed ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-caption text-coral-red"
            aria-label={`Cancel ${transfer.direction} transfer`}
            onClick={() => onCancelTransfer(transfer.transferId)}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      {itemViews.length > 0 ? (
        <ul className="grid gap-1">
          {itemViews.map((item) => (
            <li key={item.itemId} data-testid="sftp-transfer-item">
              <ProgressBar
                transferred={item.transferred}
                total={item.total}
                status={item.status}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ProgressBar({
  transferred,
  total,
  status,
}: {
  transferred: number;
  total: number;
  status: "active" | "done" | "failed" | "conflict";
}) {
  const ratio = total > 0 ? Math.min(1, transferred / total) : status === "done" ? 1 : 0;
  const pct = Math.round(ratio * 100);
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-graphite"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      data-status={status}
    >
      <span
        className="block h-full rounded-full bg-acid-lime data-[status=failed]:bg-coral-red data-[status=conflict]:bg-coral-red"
        data-status={status}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

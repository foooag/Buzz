import { KeyRound } from "lucide-react";

export function HostErrorBanner({
  hostIds,
  onConnect,
}: {
  hostIds: readonly string[];
  onConnect: () => void;
}) {
  if (!hostIds.length) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-coral-red/30 bg-coral-red/8 px-3 py-2 text-[11px] text-mist">
      <KeyRound className="size-3.5 text-coral-red" />
      <span>Saved SSH credentials are required for {hostIds.join(", ")}.</span>
      <button type="button" onClick={onConnect} className="ml-auto font-medium text-acid-lime hover:underline">
        Open Servers
      </button>
    </div>
  );
}

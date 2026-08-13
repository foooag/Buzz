import { ChevronRight, CircleAlert } from "lucide-react";

export function HostErrorBanner({
  hostIds,
  onConnect,
}: {
  hostIds: readonly string[];
  onConnect: () => void;
}) {
  if (!hostIds.length) return null;
  return (
    <div className="shrink-0 px-4 pb-3">
      <div className="pop-in mt-3 rounded-xl border border-yellow-500/35 bg-yellow-500/8 px-3.5 py-3">
        <div className="flex items-start gap-2.5">
          <CircleAlert className="mt-0.5 size-[15px] shrink-0 text-yellow-400" />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[12.5px] font-medium text-mist">
              No saved credential for {hostIds.join(", ")}
            </p>
            <p className="m-0 mt-0.5 text-[11.5px] leading-relaxed text-fog">
              The agent couldn’t connect headlessly. Connect once from the Servers page to save credentials — the rest of the task is unaffected.
            </p>
            <button
              type="button"
              onClick={onConnect}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1 text-[11.5px] text-mist transition-colors hover:bg-white/5"
            >
              <ChevronRight className="size-[11px]" />
              Open Servers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

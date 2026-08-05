import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Monitor, Server } from "lucide-react";

export type SftpSourceOption = {
  id: string;
  label: string;
  sublabel?: string;
  kind: "local" | "remote";
  online?: boolean;
};

type SourcePickerProps = {
  source: SftpSourceOption;
  sources: SftpSourceOption[];
  onSelect: (source: SftpSourceOption) => void;
};

/**
 * Dropdown button that lets the user switch a pane between local filesystem and
 * any available SSH host. Matches the design prototype's source switcher: icon +
 * label + chevron, with a popover listing all sources with status indicators.
 */
export function SourcePicker({ source, sources, onSelect }: SourcePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-fog/80 transition-colors hover:bg-white/5 hover:text-mist"
        aria-label={"Switch source from " + source.label}
      >
        {source.kind === "local" ? (
          <Monitor size={13} className="shrink-0 text-signal-teal" />
        ) : (
          <Server size={13} className="shrink-0 text-lavender" />
        )}
        <span className="normal-case tracking-normal text-mist">{source.label}</span>
        <ChevronDown
          size={11}
          className={"shrink-0 text-fog/50 transition-transform " + (open ? "rotate-180" : "")}
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-[244px] rounded-lg border border-graphite bg-carbon p-1 shadow-2xl">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-fog/50">
            Switch source
          </div>
          {sources.map((s) => {
            const active = s.id === source.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onSelect(s);
                  setOpen(false);
                }}
                className={
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors " +
                  (active ? "bg-graphite text-paper" : "text-fog hover:bg-white/5 hover:text-mist")
                }
              >
                {s.kind === "local" ? (
                  <Monitor size={13} className="shrink-0 text-signal-teal" />
                ) : (
                  <Server size={13} className="shrink-0 text-lavender" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-mist">{s.label}</span>
                  {s.sublabel ? (
                    <span className="block truncate font-mono text-[10.5px] text-fog/60">{s.sublabel}</span>
                  ) : null}
                </span>
                {s.online === false ? (
                  <span className="shrink-0 rounded-pill bg-coral-red/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-coral-red">
                    offline
                  </span>
                ) : active ? (
                  <Check size={12} className="shrink-0 text-acid-lime" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

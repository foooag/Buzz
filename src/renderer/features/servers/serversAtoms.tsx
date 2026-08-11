import { Hash, Route, Terminal, Globe } from "lucide-react";
import type { Host, HostStatus } from "../../shared/types";

export function groupColor(name?: string): string {
  switch (name) {
    case "coral":
      return "#eb5757";
    case "teal":
      return "#02b8cc";
    case "violet":
      return "#8b5cf6";
    case "lime":
      return "#e4f222";
    default:
      return "#8a8f98";
  }
}

const STATUS_LABEL: Record<HostStatus, string> = {
  online: "Online",
  offline: "Offline",
  connecting: "Connecting…",
  failed: "Failed",
};

export function StatusDot({ status, size = 7 }: { status: HostStatus; size?: number }) {
  const color =
    status === "online"
      ? "bg-pulse-green"
      : status === "failed"
        ? "bg-coral-red"
        : status === "connecting"
          ? "bg-yellow-400"
          : "bg-fog/45";
  const ring = status === "online" ? "ring-2 ring-pulse-green/15" : "";
  return (
    <span
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
      className={`inline-block rounded-full ${color} ${ring}`}
      style={{ width: size, height: size }}
    />
  );
}

const PROTOCOL_STYLE = {
  ssh: { label: "SSH", cls: "bg-signal-teal/12 text-signal-teal", Icon: Terminal },
  telnet: { label: "Telnet", cls: "bg-lavender/12 text-lavender", Icon: Globe },
  serial: { label: "Serial", cls: "bg-acid-lime/12 text-acid-lime", Icon: Route },
} as const;

export function ProtocolBadge({ protocol = "ssh" }: { protocol?: Host["protocol"] }) {
  const style = (protocol && PROTOCOL_STYLE[protocol]) ?? PROTOCOL_STYLE.ssh;
  const Icon = style.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${style.cls}`}
    >
      <Icon size={11} />
      {style.label}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-graphite/80 px-2 py-0.5 text-[11px] text-fog">
      <Hash size={9} className="text-fog/60" />
      {children}
    </span>
  );
}

export function hostEndpoint(host: Host): string {
  if (host.protocol === "serial") return `${host.address} @ ${host.baudRate ?? 115200}`;
  const port = host.port && host.port !== 22 ? `:${host.port}` : "";
  return `${host.username || "user"}@${host.address}${port}`;
}

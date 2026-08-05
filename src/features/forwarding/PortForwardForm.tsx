import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ForwardKind,
  PortForwardRule,
  PortForwardRuleInput,
} from "./forwardingTypes";

export function PortForwardForm({
  open,
  hostId,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  hostId: string;
  initial?: PortForwardRule;
  onClose: () => void;
  onSubmit: (input: PortForwardRuleInput) => void;
}) {
  const [kind, setKind] = useState<ForwardKind>(initial?.kind ?? "local");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [bindHost, setBindHost] = useState(
    initial?.bindHost ?? "127.0.0.1",
  );
  const [bindPort, setBindPort] = useState(
    initial ? String(initial.bindPort) : "",
  );
  const [targetHost, setTargetHost] = useState(initial?.targetHost ?? "");
  const [targetPort, setTargetPort] = useState(
    initial?.targetPort ? String(initial.targetPort) : "",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKind(initial?.kind ?? "local");
      setLabel(initial?.label ?? "");
      setBindHost(initial?.bindHost ?? "127.0.0.1");
      setBindPort(initial ? String(initial.bindPort) : "");
      setTargetHost(initial?.targetHost ?? "");
      setTargetPort(initial?.targetPort ? String(initial.targetPort) : "");
      setError(null);
    }
  }, [open, initial]);

  const submit = () => {
    const bind = Number(bindPort);
    if (!Number.isInteger(bind) || bind < 1 || bind > 65535) {
      setError("Enter a valid port (1–65535).");
      return;
    }
    if (kind !== "dynamic") {
      const target = Number(targetPort);
      if (
        !targetHost.trim() ||
        !Number.isInteger(target) ||
        target < 1 ||
        target > 65535
      ) {
        setError("Enter a valid target host and port.");
        return;
      }
      onSubmit({
        id: initial?.id,
        hostId,
        kind,
        bindHost: bindHost.trim() || "127.0.0.1",
        bindPort: bind,
        targetHost: targetHost.trim(),
        targetPort: target,
        label: label.trim() || null,
      });
      return;
    }
    onSubmit({
      id: initial?.id,
      hostId,
      kind,
      bindHost: bindHost.trim() || "127.0.0.1",
      bindPort: bind,
      targetHost: null,
      targetPort: null,
      label: label.trim() || null,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit port forward" : "New port forward"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Label className="grid gap-1.5">
            Kind
            <Select
              value={kind}
              onValueChange={(value) => setKind(value as ForwardKind)}
            >
              <SelectTrigger aria-label="Kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
                <SelectItem value="dynamic">Dynamic (SOCKS5)</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1.5">
            Label <span className="text-fog/60">(optional)</span>
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. staging database"
              aria-label="Label"
            />
          </Label>
          <Label className="grid gap-1.5">
            Bind host
            <Input
              value={bindHost}
              onChange={(event) => setBindHost(event.target.value)}
            />
          </Label>
          <Label className="grid gap-1.5">
            Bind port
            <Input
              inputMode="numeric"
              value={bindPort}
              onChange={(event) => setBindPort(event.target.value)}
              aria-label="Bind port"
            />
          </Label>
          {kind !== "dynamic" ? (
            <>
              <Label className="grid gap-1.5">
                Target host
                <Input
                  value={targetHost}
                  onChange={(event) => setTargetHost(event.target.value)}
                  aria-label="Target host"
                />
              </Label>
              <Label className="grid gap-1.5">
                Target port
                <Input
                  inputMode="numeric"
                  value={targetPort}
                  onChange={(event) => setTargetPort(event.target.value)}
                  aria-label="Target port"
                />
              </Label>
            </>
          ) : null}
          {error ? (
            <p className="m-0 text-[12px] text-coral-red">{error}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={submit}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

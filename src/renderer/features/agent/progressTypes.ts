export type CommandStepStatus = "running" | "ok" | "error" | "queued";

export type CommandStep = {
  id: string;
  command: string;
  status: CommandStepStatus;
  output?: string;
  awaitingConfirmation?: boolean;
  error?: string;
};

export type HostPhase = "connecting" | "working" | "done" | "error" | "aborted";

export type HostProgress = {
  hostId: string;
  hostLabel: string;
  phase: HostPhase;
  commands: CommandStep[];
};

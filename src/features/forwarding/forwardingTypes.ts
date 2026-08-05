export type ForwardKind = "local" | "remote" | "dynamic";

export type PortForwardRule = {
  id: string;
  hostId: string;
  kind: ForwardKind;
  bindHost: string;
  bindPort: number;
  targetHost: string | null;
  targetPort: number | null;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortForwardRuleInput = Omit<
  PortForwardRule,
  "id" | "createdAt" | "updatedAt" | "label"
> & {
  id?: string;
  label?: string | null;
};

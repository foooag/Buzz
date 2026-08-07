import { callCommand, callStreamingCommand } from "../../app/ipc";
import type { TerminalEvent } from "../shell/terminalTypes";
import { isTerminalEvent } from "../shell/terminalTypes";
import type { CreateSshProfile } from "../ssh/sshTypes";
import {
  activeForwardIdListSchema,
  portForwardRuleListSchema,
  portForwardRuleSchema,
} from "./forwardingSchema";
import type {
  PortForwardRule,
  PortForwardRuleInput,
} from "./forwardingTypes";

export type StartPortForwardRule = {
  id: string;
  kind: PortForwardRule["kind"];
  bindHost: string;
  bindPort: number;
  targetHost: string | null;
  targetPort: number | null;
};

export type ForwardingApi = {
  listRules(hostId: string): Promise<PortForwardRule[]>;
  createRule(input: PortForwardRuleInput): Promise<PortForwardRule>;
  updateRule(rule: PortForwardRule): Promise<PortForwardRule>;
  deleteRule(ruleId: string): Promise<void>;
  listActive(): Promise<string[]>;
  start(
    profile: CreateSshProfile,
    rule: StartPortForwardRule,
    onEvent: (event: TerminalEvent) => void,
  ): Promise<void>;
  decideHostKey(ruleId: string, trust: boolean): Promise<void>;
  stop(ruleId: string): Promise<void>;
};

async function parsed<T>(
  command: string,
  args: object,
  schema: { parse(value: unknown): T },
) {
  return schema.parse(await callCommand<object, unknown>(command, args));
}

export const forwardingApi: ForwardingApi = {
  listRules: (hostId) =>
    parsed("port_forward_list_rules", { hostId }, portForwardRuleListSchema),
  createRule: (rule) =>
    parsed(
      "port_forward_create_rule",
      {
        rule: {
          id: rule.id ?? "",
          hostId: rule.hostId,
          kind: rule.kind,
          bindHost: rule.bindHost,
          bindPort: rule.bindPort,
          targetHost: rule.targetHost,
          targetPort: rule.targetPort,
          label: rule.label ?? null,
          createdAt: "",
          updatedAt: "",
        },
      },
      portForwardRuleSchema,
    ),
  updateRule: (rule) =>
    parsed("port_forward_update_rule", { rule }, portForwardRuleSchema),
  deleteRule: (ruleId) =>
    callCommand("port_forward_delete_rule", { ruleId }),
  listActive: () =>
    parsed("port_forward_list_active", {}, activeForwardIdListSchema),
  start: (profile, rule, onEvent) =>
    callStreamingCommand<unknown, TerminalEvent, void>(
      "port_forward_start",
      {
        profile,
        rule: {
          ...rule,
          // The established Rust engine uses an empty target host for
          // dynamic forwards; persisted records use null to model absence.
          targetHost: rule.targetHost ?? "",
        },
      },
      (event) => {
        if (isTerminalEvent(event)) onEvent(event);
      },
    ),
  decideHostKey: (ruleId, trust) =>
    callCommand("port_forward_decide_host_key", { ruleId, trust }),
  stop: (ruleId) => callCommand("port_forward_stop", { ruleId }),
};

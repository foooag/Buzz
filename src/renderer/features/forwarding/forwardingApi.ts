import { COMMANDS } from "@shared/ipc/command-names";
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
    parsed(COMMANDS.portForwardListRules, { hostId }, portForwardRuleListSchema),
  createRule: (rule) =>
    parsed(
      COMMANDS.portForwardCreateRule,
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
    parsed(COMMANDS.portForwardUpdateRule, { rule }, portForwardRuleSchema),
  deleteRule: (ruleId) =>
    callCommand(COMMANDS.portForwardDeleteRule, { ruleId }),
  listActive: () =>
    parsed(COMMANDS.portForwardListActive, {}, activeForwardIdListSchema),
  start: (profile, rule, onEvent) =>
    callStreamingCommand<unknown, TerminalEvent, void>(
      COMMANDS.portForwardStart,
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
    callCommand(COMMANDS.portForwardDecideHostKey, { ruleId, trust }),
  stop: (ruleId) => callCommand(COMMANDS.portForwardStop, { ruleId }),
};

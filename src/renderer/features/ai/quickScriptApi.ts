import { COMMANDS } from "@shared/ipc/command-names";
import type {
  QuickScript,
  QuickScriptGenerationResult,
  QuickScriptPatch,
} from "@shared/ipc/quickscripts/types";
import { callCommand } from "../../app/ipc";
import { createDeterministicQuickScriptApi } from "./deterministicQuickScriptApi";
import type { QuickScriptApi } from "./deterministicQuickScriptApi";

export type { QuickScriptApi } from "./deterministicQuickScriptApi";

export const quickScriptApi: QuickScriptApi = {
  generate: (input) =>
    callCommand<{ sshSessionId: string; useLlm?: boolean }, QuickScriptGenerationResult>(
      COMMANDS.quickScriptGenerate,
      input,
    ),
  list: (hostId, includeDismissed) =>
    callCommand<{ hostId: string; includeDismissed?: boolean }, QuickScript[]>(
      COMMANDS.quickScriptList,
      { hostId, includeDismissed },
    ),
  update: (id, patch) =>
    callCommand<{ id: string; patch: QuickScriptPatch }, QuickScript>(
      COMMANDS.quickScriptUpdate,
      { id, patch },
    ),
  delete: (id) =>
    callCommand<{ id: string }, void>(COMMANDS.quickScriptDelete, { id }),
  clearData: (hostId) =>
    callCommand<{ hostId?: string }, void>(COMMANDS.quickScriptClearData, { hostId }),
};

export { createDeterministicQuickScriptApi };

import { COMMANDS } from "@shared/ipc/command-names";
import { callCommand } from "../../app/ipc";
import type {
  AiConfigApi,
  AiProviderConfig,
  CreateAiProviderConfig,
  ProbeAiProviderInput,
  ProviderTestResult,
  UpdateAiProviderConfig,
} from "./aiConfigTypes";

export const aiConfigApi: AiConfigApi = {
  list: () => callCommand<null, AiProviderConfig[]>(COMMANDS.aiListProviderConfigs, null),
  create: (input: CreateAiProviderConfig) =>
    callCommand<{ input: CreateAiProviderConfig }, AiProviderConfig>(
      COMMANDS.aiCreateProviderConfig,
      { input },
    ),
  update: (input: UpdateAiProviderConfig) =>
    callCommand<{ input: UpdateAiProviderConfig }, AiProviderConfig>(
      COMMANDS.aiUpdateProviderConfig,
      { input },
    ),
  delete: (id: string) =>
    callCommand<{ id: string }, void>(COMMANDS.aiDeleteProviderConfig, { id }),
  test: (id: string) =>
    callCommand<{ id: string }, AiProviderConfig>(COMMANDS.aiTestProviderConfig, {
      id,
    }),
  probe: (input: ProbeAiProviderInput) =>
    callCommand<{ input: ProbeAiProviderInput }, ProviderTestResult>(
      COMMANDS.aiProbeProviderConfig,
      { input },
    ),
};

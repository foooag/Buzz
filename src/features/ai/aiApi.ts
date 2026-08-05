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
  list: () => callCommand<null, AiProviderConfig[]>("ai_list_provider_configs", null),
  create: (input: CreateAiProviderConfig) =>
    callCommand<{ input: CreateAiProviderConfig }, AiProviderConfig>(
      "ai_create_provider_config",
      { input },
    ),
  update: (input: UpdateAiProviderConfig) =>
    callCommand<{ input: UpdateAiProviderConfig }, AiProviderConfig>(
      "ai_update_provider_config",
      { input },
    ),
  delete: (id: string) =>
    callCommand<{ id: string }, void>("ai_delete_provider_config", { id }),
  test: (id: string) =>
    callCommand<{ id: string }, AiProviderConfig>("ai_test_provider_config", {
      id,
    }),
  probe: (input: ProbeAiProviderInput) =>
    callCommand<{ input: ProbeAiProviderInput }, ProviderTestResult>(
      "ai_probe_provider_config",
      { input },
    ),
};

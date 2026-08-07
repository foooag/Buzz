import { callCommand } from "@/app/ipc";
import type { AiAgentMessage } from "./aiAgentTypes";

export type AiSessionSummary = {
  id: string;
  title: string;
  providerConfigId: string;
  sshSessionId: string;
  messageCount: number;
  lastStatus: string | null;
  encryptedBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type AiSessionRecord = AiSessionSummary & {
  messages: AiAgentMessage[];
};

export type AiSessionClient = {
  list: () => Promise<AiSessionSummary[]>;
  load: (id: string) => Promise<AiSessionRecord>;
  delete: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<AiSessionSummary>;
};

export const aiSessionApi: AiSessionClient = {
  list: () => callCommand<null, AiSessionSummary[]>("ai_list_sessions", null),
  load: (id) =>
    callCommand<{ id: string }, AiSessionRecord>("ai_load_session", { id }),
  delete: (id) =>
    callCommand<{ id: string }, void>("ai_delete_session", { id }),
  rename: (id, title) =>
    callCommand<{ id: string; title: string }, AiSessionSummary>(
      "ai_rename_session",
      { id, title },
    ),
};

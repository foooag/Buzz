import type { CommandHandlers } from "../ipc/dispatcher.js";
import { success } from "../ipc/result.js";

export type AppHealth = {
  name: "buzz";
  version: string;
};

export function createAppCommandHandlers(version: string): CommandHandlers {
  return {
    app_health: () => success<AppHealth>({ name: "buzz", version }),
  };
}

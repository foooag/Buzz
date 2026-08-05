import type { TerminalApi } from "./terminalApi";
import type { TerminalEvent } from "./terminalTypes";

export function createDeterministicTerminalApi(): TerminalApi {
  let nextId = 1;
  const sessions = new Map<string, (event: TerminalEvent) => void>();

  return {
    async open(_size, onEvent) {
      const sequence = nextId++;
      const sessionId = `deterministic-${sequence}`;
      sessions.set(sessionId, onEvent);
      queueMicrotask(() =>
        onEvent({
          type: "output",
          sessionId,
          data: Array.from(new TextEncoder().encode(`Local Terminal ${sequence}\r\n`)),
        }),
      );
      return { sessionId, title: `Local Terminal ${sequence}` };
    },

    async write(sessionId, data) {
      sessions.get(sessionId)?.({ type: "output", sessionId, data: Array.from(data) });
    },

    async resize() {},

    async close(sessionId) {
      sessions.delete(sessionId);
    },
  };
}

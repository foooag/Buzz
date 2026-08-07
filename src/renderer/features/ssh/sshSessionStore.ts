import { create } from "zustand";
import type { HostKeyPrompt } from "./sshTypes";

type SshSessionUiState = {
  pendingHostKey: HostKeyPrompt | null;
  changedSessionId: string | null;
  reconnectable: string[];
  setPendingHostKey: (prompt: HostKeyPrompt | null) => void;
  setChanged: (sessionId: string | null) => void;
  setReconnectable: (sessionId: string) => void;
};

export const useSshSessionStore = create<SshSessionUiState>((set) => ({
  pendingHostKey: null,
  changedSessionId: null,
  reconnectable: [],
  setPendingHostKey: (pendingHostKey) => set({ pendingHostKey }),
  setChanged: (changedSessionId) => set({ changedSessionId }),
  setReconnectable: (sessionId) => set((state) => ({
    reconnectable: state.reconnectable.includes(sessionId)
      ? state.reconnectable : [...state.reconnectable, sessionId],
  })),
}));

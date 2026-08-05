import type { WindowControlsApi } from "./windowControlsApi";

// Deterministic no-op stub for tests. Plain async functions so the stub
// can be `vi.spyOn`'d (or replaced wholesale) without pulling vitest into
// the production module graph.
export const deterministicWindowControlsApi: WindowControlsApi = {
  minimize: async () => undefined,
  toggleMaximize: async () => undefined,
};

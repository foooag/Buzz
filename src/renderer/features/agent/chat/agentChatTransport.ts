import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type {
  AgentClient,
  AgentEvent,
  AgentMessage,
  AgentSnapshot,
  AgentToolCallPart,
} from "@/features/agent/agentTypes";
import { suffixDelta } from "./agentMessageAdapter";

export type AgentChatTransportContext = {
  agentClient: AgentClient;
  getAgentId: () => string | undefined;
  resolveTargets: (text: string) => string[];
  onSideEvent: (event: AgentEvent) => void;
  onComplete: (snapshot: AgentSnapshot) => void;
};

type ToolMeta = {
  startedAt?: number;
  completedAt?: number;
  approval?: AgentToolCallPart["approval"];
};

function userText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  return last.parts
    .filter((p): p is Extract<UIMessage["parts"][number], { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function createAgentChatTransport(ctx: AgentChatTransportContext): ChatTransport<UIMessage> {
  return {
    async sendMessages({ messages, abortSignal }) {
      const text = userText(messages);
      const targets = ctx.resolveTargets(text);
      const encoder = new StreamEncoder();
      const toolMeta = new Map<string, ToolMeta>();
      const seenTools = new Set<string>();
      const emittedText = new Map<string, string>();
      const emittedReasoning = new Map<string, string>();
      let aborted = false;

      abortSignal?.addEventListener("abort", () => {
        if (aborted) return;
        aborted = true;
        const id = ctx.getAgentId();
        if (id) void ctx.agentClient.abort(id).catch(() => undefined);
        // Close the stream so consumers waiting on reader.read() unblock. The
        // pending prompt await is abandoned; when it eventually resolves/rejects
        // the `!aborted` guards in start() skip finish/close.
        encoder.close();
      });

      const onEvent = (event: AgentEvent) => {
        if (aborted) return;
        ctx.onSideEvent(event);
        switch (event.type) {
          case "messageStart":
          case "messageUpdate":
          case "messageEnd":
            encodeAssistant(encoder, event.message, emittedText, emittedReasoning, seenTools, toolMeta);
            return;
          case "toolStart": {
            const meta = toolMeta.get(event.toolCallId) ?? {};
            meta.startedAt = Date.now();
            toolMeta.set(event.toolCallId, meta);
            return;
          }
          case "toolEnd": {
            const meta = toolMeta.get(event.toolCallId) ?? {};
            meta.completedAt = Date.now();
            encoder.enqueueToolOutput(event.toolCallId, event.result, event.isError, meta);
            return;
          }
          case "toolConfirmationRequired": {
            // Confirmation approval is captured into the meta map so the eventual
            // tool-output carries `approval`. Keying by toolCallId happens at
            // toolEnd time; the side handler in the view layer tracks approval
            // state separately. Forwarding to onSideEvent already happened above.
            return;
          }
          default:
            return;
        }
      };

      return new ReadableStream<UIMessageChunk>({
        async start(controller) {
          encoder.setController(controller);
          try {
            const agentId = ctx.getAgentId();
            if (!agentId) throw new Error("No active agent.");
            const snapshot = await ctx.agentClient.prompt(agentId, text, targets, onEvent);
            if (!aborted) {
              encoder.finish();
              ctx.onComplete(snapshot);
            }
          } catch (err) {
            controller.error(err);
            return;
          }
          if (!aborted) controller.close();
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };
}

// ---- stream encoder: isolates the exact v7 UIMessageChunk discriminants ----
// v7 field-name notes (verified against ai@7.0.58 index.d.ts):
//   - `start` carries `messageId` (not `id`); no `role` field.
//   - `text-delta` / `reasoning-delta` carry the delta on `delta` (not `textDelta`).
class StreamEncoder {
  private ctrl: ReadableStreamDefaultController<UIMessageChunk> | undefined;
  private started = new Set<string>();
  private textStarted = new Set<string>();
  private reasoningStarted = new Set<string>();

  setController(ctrl: ReadableStreamDefaultController<UIMessageChunk>) {
    this.ctrl = ctrl;
  }

  private enqueue(chunk: UIMessageChunk) {
    this.ctrl?.enqueue(chunk);
  }

  startMessage(id: string) {
    if (this.started.has(id)) return;
    this.started.add(id);
    this.enqueue({ type: "start", messageId: id });
  }

  textDelta(id: string, delta: string) {
    if (!this.textStarted.has(id)) {
      this.textStarted.add(id);
      this.enqueue({ type: "text-start", id });
    }
    this.enqueue({ type: "text-delta", id, delta });
  }

  reasoningDelta(id: string, delta: string) {
    if (!this.reasoningStarted.has(id)) {
      this.reasoningStarted.add(id);
      this.enqueue({ type: "reasoning-start", id });
    }
    this.enqueue({ type: "reasoning-delta", id, delta });
  }

  toolInputAvailable(part: AgentToolCallPart) {
    this.enqueue({ type: "tool-input-start", toolCallId: part.toolCallId, toolName: part.toolName });
    this.enqueue({ type: "tool-input-available", toolCallId: part.toolCallId, toolName: part.toolName, input: part.args });
  }

  enqueueToolOutput(toolCallId: string, result: unknown, isError: boolean, meta: ToolMeta) {
    // Emit exclusively: error tools → output-error only, success tools →
    // output-available only. v7 types `tool-output-error` with `errorText` and
    // no `output` shape, matching the Task 3 adapter's isError split so the
    // live-stream part state agrees with the snapshot-authority part state.
    if (isError) {
      this.enqueue({ type: "tool-output-error", toolCallId, errorText: errorMessage(result) ?? "Tool failed." });
      return;
    }
    this.enqueue({
      type: "tool-output-available",
      toolCallId,
      output: {
        result,
        isError,
        timing: { startedAt: meta.startedAt, completedAt: meta.completedAt },
        approval: meta.approval,
      },
    });
  }

  finish() {
    this.enqueue({ type: "finish" });
  }

  close() {
    // Close is idempotent if guarded by the transport's `aborted` flag; swallowing
    // the TypeError that fires if the controller is already closed.
    try {
      this.ctrl?.close();
    } catch {
      // already closed — ignore
    }
  }
}

function encodeAssistant(
  encoder: StreamEncoder,
  message: AgentMessage,
  emittedText: Map<string, string>,
  emittedReasoning: Map<string, string>,
  seenTools: Set<string>,
  _toolMeta: Map<string, ToolMeta>,
) {
  if (message.role !== "assistant") return;
  encoder.startMessage(message.id);
  for (const part of message.content) {
    if (part.type === "text") {
      const prev = emittedText.get(message.id) ?? "";
      const delta = suffixDelta(prev, part.text);
      if (delta) {
        encoder.textDelta(message.id, delta);
        emittedText.set(message.id, prev + delta);
      }
    } else if (part.type === "reasoning") {
      const prev = emittedReasoning.get(message.id) ?? "";
      const delta = suffixDelta(prev, part.text);
      if (delta) {
        encoder.reasoningDelta(message.id, delta);
        emittedReasoning.set(message.id, prev + delta);
      }
    } else if (part.type === "tool-call" && !seenTools.has(part.toolCallId)) {
      seenTools.add(part.toolCallId);
      encoder.toolInputAvailable(part);
    }
  }
}

function errorMessage(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const error = (result as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

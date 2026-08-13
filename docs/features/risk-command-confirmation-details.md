# Risk Command Confirmation Details

Agent risk confirmations show the exact remote command and the Agent's plain-language interpretation before execution.

## What it does

When `host_exec` or `ssh_exec` triggers the high-risk gate, the Agent page and AI sidebar confirmation dialogs display the command, its expected effect as interpreted by AI, and the deterministic risk reason.

## How to use

Review all three sections in the confirmation dialog, then choose **Run command** to proceed or **Cancel** to reject it.

## Where it lives

- `src/main/domains/agent/agent-runtime.ts`
- `src/shared/agent-stream.ts`
- `src/renderer/features/agent/ConfirmCard.tsx`
- `src/renderer/features/ai/AiAssistantPanel.tsx`

## Security notes

The confirmation token stays in the Electron main process. Only the command, Agent interpretation, and risk reason cross the IPC boundary for review.

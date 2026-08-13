# AI Assistant Markdown Responses

AI Assistant responses render streaming Markdown for readable structure, links, lists, and highlighted code while the model is still replying.

## What it does

Assistant text uses Streamdown to repair incomplete streaming Markdown and progressively render rich content. Code fences use Shiki highlighting with light and dark themes.

## How to use

Open the AI sidebar from an active Linux SSH session and send a message. Markdown in the assistant response is formatted automatically as it streams.

## Where it lives

- `src/renderer/features/ai/AiAssistantPanel.tsx`
- `src/renderer/styles/globals.css`


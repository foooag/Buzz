#!/usr/bin/env bash
set -euo pipefail

# Buzz — one-command bootstrap for contributors.
# Installs pnpm if needed, installs dependencies, and starts the dev app.

cd "$(dirname "$0")"

NEED_PNPM=0
if ! command -v pnpm >/dev/null 2>&1; then
  NEED_PNPM=1
fi

if [ "$NEED_PNPM" -eq 1 ]; then
  echo "pnpm not found. Installing via corepack…"
  corepack enable 2>/dev/null || npm install -g pnpm@10
fi

echo "Installing dependencies…"
pnpm install --frozen-lockfile

echo
echo "Setup complete. Starting the dev app…"
exec pnpm dev

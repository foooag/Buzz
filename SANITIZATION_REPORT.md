# SANITIZATION_REPORT.md — Buzz

Verdict: **PASS**

## Scan summary

| Category | Result |
|---|---|
| 1. Secrets scan | PASS |
| 2. PII scan | PASS |
| 3. Internal references | PASS (synthetic fixtures only) |
| 4. Dangerous files | PASS |
| 5. Configuration completeness | WARNING (generated during packaging) |
| 6. Git history | N/A — fresh repository, no history carried over |

## Detail

### 1. Secrets — PASS
- No API keys/tokens matching known formats (`sk-…`, `AKIA…`, `ghp_…`, `AIza…`, `xoxb-…`, `github_pat_`, `glpat-…`).
- No `BEGIN … PRIVATE KEY` / `BEGIN CERTIFICATE` blocks. The only matches are UI placeholder strings
  `"-----BEGIN OPENSSH PRIVATE KEY-----"` (private-key textarea placeholder) and test fixtures asserting that placeholder.
- No 64-char hex secret literals.
- Historical pickaxe audit (`git log -S`) found only `sk-` substring hits in words like "risk"/"Step" and
  `sk-secret` / redacted `sk-proj-···` placeholders. No real key material in history.

### 2. PII — PASS
- Only public npm-package metadata email (`i@izs.me` in `pnpm-lock.yaml`) and `noreply@anthropic.com`
  (Claude attribution in a doc). No personal addresses.

### 3. Internal references — PASS
- `package.json` `publish.owner = "foooag"` is the intentional public release target.
- `.internal` hostnames (`db.internal`, `server.internal`, `shop.internal`, `gateway.secret.internal`) are
  fictional RFC 6761 test/demo fixtures, not real infrastructure.

### 4. Dangerous files — PASS
- No `.env`, `*.pem`, `*.key`, `credentials.json`, `*.p12`, `*.pfx`, or SSH key files in the tree.

### 5. Configuration completeness — WARNING (resolved)
- `.gitignore` present and correct (`node_modules/`, `dist/`, `dist-electron/`, `release/`, `.env`, `*.pem`, `*.key`, …).
- `.env.example`, `LICENSE`, `README.md`, `CONTRIBUTING.md`, and issue templates generated during packaging.

### 6. Git history
- The public repository is initialized fresh with the sanitized tree; no commit history is carried over.

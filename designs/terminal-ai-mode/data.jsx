// data.jsx — session + provider metadata, terminal scrollback, the scripted
// agent timeline (SSH 502 investigation), an inline icon set, and small helpers.
// Everything is exported to `window` so the other Babel files can consume it.

const { useEffect, useRef, useState } = React;

/* ----------------------------------------------------------------------------
 * Session + provider context
 * ------------------------------------------------------------------------- */

const SESSION = {
  title: "web-prod-01",
  user: "ubuntu",
  host: "web-prod-01",
  cwd: "~",
};

const PROVIDER = {
  name: "Claude",
  model: "Sonnet 5",
  kind: "cloud", // cloud providers get the secret scrubber; local (Ollama) would not
};

const DEMO_REQUEST =
  "The shop keeps returning 502 Bad Gateway. Investigate and fix it.";

/* ----------------------------------------------------------------------------
 * Terminal scrollback — what's already on screen when AI mode engages.
 * A line is either a string (single token, default color) or an array of
 * [text, className] pairs. Empty string = blank line.
 * ------------------------------------------------------------------------- */

function prompt(user, host, path) {
  return [
    [`${user}@${host}`, "c-green"],
    [":", "c-dim"],
    [path, "c-blue"],
    ["$ ", "c-dim"],
  ];
}

const PROMPT = prompt(SESSION.user, SESSION.host, SESSION.cwd);

const SCROLLBACK = [
  ["Last login: Fri Jul 25 09:14:02 2026 from 10.0.0.4", "c-dim"],
  "",
  [
    ...PROMPT,
    ["curl -sS -o /dev/null -w \"status=%{http_code} time=%{time_total}\\n\" https://shop.internal", ""],
  ],
  [["status=502 time=0.041", "c-red"]],
  [...PROMPT, ["curl -sS -o /dev/null -w \"status=%{http_code}\\n\" https://shop.internal", ""]],
  [["status=502", "c-red"]],
];

/* ----------------------------------------------------------------------------
 * The scripted agent turn. Each segment is either:
 *   { kind: "assistant", text }                     — streamed assistant text
 *   { kind: "exec", cmd, verdict, durationMs, exitCode, full, excerpt }
 * verdict = { allow: true } | { allow: false, level, reason, projectedEffect }
 * full   = array of colored output lines (string | [text,cls][])
 * ------------------------------------------------------------------------- */

const TIMELINE = [
  {
    kind: "assistant",
    text: "I'll dig into the 502s. I'll read the nginx error log first, then trace the upstream it can't reach.",
  },
  {
    kind: "exec",
    cmd: "tail -n 30 /var/log/nginx/error.log",
    verdict: { allow: true },
    durationMs: 380,
    exitCode: 0,
    excerpt: 4,
    full: [
      [
        ["2026/07/25 09:18:41 ", "c-dim"],
        ["[error] ", "c-red"],
        ["412#412: *87 ", ""],
        ["connect() failed (111: Connection refused)", "c-yellow"],
        [" while connecting to upstream", ""],
      ],
      [
        ["  request: \"GET / HTTP/1.1\", upstream: \"http://127.0.0.1:8000/\"", "c-dim"],
      ],
      [
        ["2026/07/25 09:19:01 ", "c-dim"],
        ["[error] ", "c-red"],
        ["412#412: *90 ", ""],
        ["connect() failed (111: Connection refused)", "c-yellow"],
        [" while connecting to upstream", ""],
      ],
      [
        ["  upstream: \"http://127.0.0.1:8000/api/cart\"", "c-dim"],
      ],
      [
        ["2026/07/25 09:19:18 ", "c-dim"],
        ["[error] ", "c-red"],
        ["412#412: *91 ", ""],
        ["connect() failed (111: Connection refused)", "c-yellow"],
      ],
      [["  upstream: \"http://127.0.0.1:8000/\"", "c-dim"]],
    ],
  },
  {
    kind: "assistant",
    text: "nginx is trying to reach 127.0.0.1:8000 and getting connection refused — nothing is listening on the upstream. Let me check the gunicorn service.",
  },
  {
    kind: "exec",
    cmd: "systemctl status gunicorn --no-pager",
    verdict: { allow: true },
    durationMs: 520,
    exitCode: 3,
    excerpt: 5,
    full: [
      [["● ", "c-red"], ["gunicorn.service", "c-white"], [" - Gunicorn daemon for shop.app", ""]],
      [["     Loaded: ", "c-dim"], ["loaded (/etc/systemd/system/gunicorn.service; enabled)", ""]],
      [["     Active: ", "c-dim"], ["failed (Result: exit-code)", "c-red"], [" since Fri 2026-07-25 08:54:10 UTC; 24min ago", ""]],
      [
        ["   Process: ", "c-dim"],
        ["1284 ExecStart=/usr/bin/gunicorn --bind 127.0.0.1:8000 shop.app:app", ""],
        ["(code=exited, status=203/EXEC)", "c-red"],
      ],
      [["Jul 25 08:54:10 web-prod-01 systemd[1]: ", "c-dim"], ["Stopped gunicorn.service — start request repeated too quickly.", ""]],
      [["Jul 25 08:54:10 web-prod-01 systemd[1]: gunicorn.service: ", "c-dim"], ["Failed with result 'exit-code'.", "c-yellow"]],
    ],
  },
  {
    kind: "assistant",
    text: "Found it: gunicorn crashed with status 203/EXEC, so nothing is serving on :8000. I'll restart the service.",
  },
  {
    kind: "exec",
    cmd: "sudo systemctl restart gunicorn",
    verdict: {
      allow: false,
      level: "high",
      reason: "Uses sudo to restart a systemd service on a production host.",
      projectedEffect:
        "Restarts gunicorn on web-prod-01 (127.0.0.1:8000). The shop will be unavailable for ~2–4 s while workers reload; in-flight requests will drop.",
    },
    durationMs: 1900,
    exitCode: 0,
    excerpt: 1,
    full: [[["(no output — service restarted successfully)", "c-dim"]]],
  },
  {
    kind: "assistant",
    text: "Restarted. Let me confirm the upstream is healthy again.",
  },
  {
    kind: "exec",
    cmd: "curl -sS -o /dev/null -w \"health=%{http_code}\\n\" http://127.0.0.1:8000/health",
    verdict: { allow: true },
    durationMs: 120,
    exitCode: 0,
    excerpt: 1,
    full: [[["health=200", "c-green"]]],
  },
  {
    kind: "assistant",
    text: "Fixed. gunicorn (127.0.0.1:8000) had crashed with status 203/EXEC, so nginx returned 502 for every request. I restarted the service and verified the health endpoint now returns 200. To prevent this recurring, check `journalctl -u gunicorn -n 100` — 203/EXEC usually points to a broken interpreter or venv path in the unit file.",
  },
];

/* ----------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Normalize a line (string | token[]) into a token[] ([text, cls][]).
function lineTokens(line) {
  if (typeof line === "string") return [[line, ""]];
  return line;
}

let _id = 0;
function nextId(prefix) {
  _id += 1;
  return `${prefix}-${_id}`;
}

// Build a prompt token array for an arbitrary host (used when the session
// view is opened on a host other than the scripted web-prod-01 demo).
function buildPrompt(host) {
  return prompt(host.user, host.host, host.cwd ?? "~");
}

// A short, host-generic scrollback for the session view.
function buildScrollback(host) {
  return [
    [`Last login: Fri Jul 25 ${(9 + (host.offset ?? 0) % 12).toString().padStart(2, "0")}:31:07 2026 from 10.0.0.4`, "c-dim"],
    "",
    [...buildPrompt(host), [`uname -a`, ""]],
    [["Linux " + host.host + " 6.8.0-31-generic #31-Ubuntu SMP x86_64 GNU/Linux", "c-dim"]],
    "",
    [...buildPrompt(host), [`uptime`, ""]],
    [[" 21:09 up 14 days,  3:47,  1 user,  load average: 0.18, 0.22, 0.19", "c-green"]],
  ];
}

Object.assign(window, {
  buildPrompt,
  buildScrollback,
});

/* ----------------------------------------------------------------------------
 * Icon set (lucide-style, 24×24, stroke currentColor). Filled glyphs set their
 * own fill on the inner element.
 * ------------------------------------------------------------------------- */

function Icon({ name, size = 18, className = "", strokeWidth = 1.75 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
    "aria-hidden": true,
  };
  switch (name) {
    case "server":
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="19" height="7" rx="2" />
          <rect x="2.5" y="14" width="19" height="7" rx="2" />
          <line x1="6" y1="6.5" x2="6.01" y2="6.5" />
          <line x1="6" y1="17.5" x2="6.01" y2="17.5" />
        </svg>
      );
    case "folder":
      return (
        <svg {...common}>
          <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        </svg>
      );
    case "network":
      return (
        <svg {...common}>
          <rect x="9" y="2.5" width="6" height="5.5" rx="1.2" />
          <rect x="2.5" y="16" width="6" height="5.5" rx="1.2" />
          <rect x="15.5" y="16" width="6" height="5.5" rx="1.2" />
          <path d="M12 8v3" />
          <path d="M5.5 16v-1.5A2 2 0 0 1 7.5 12.5h9a2 2 0 0 1 2 2V16" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
        </svg>
      );
    case "terminal":
      return (
        <svg {...common}>
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
    case "grip":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <circle cx="9" cy="6" r="1.3" />
          <circle cx="9" cy="12" r="1.3" />
          <circle cx="9" cy="18" r="1.3" />
          <circle cx="15" cy="6" r="1.3" />
          <circle cx="15" cy="12" r="1.3" />
          <circle cx="15" cy="18" r="1.3" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      );
    case "rotate":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      );
    case "columns":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="12" y1="3" x2="12" y2="21" />
        </svg>
      );
    case "rows":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...common}>
          <line x1="3" y1="7" x2="21" y2="7" />
          <line x1="3" y1="17" x2="21" y2="17" />
          <circle cx="8" cy="7" r="2.2" />
          <circle cx="16" cy="17" r="2.2" />
        </svg>
      );
    case "panel":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...common}>
          <path d="M12 3l1.5 4.2L18 9l-4.5 1.8L12 15l-1.5-4.2L6 9l4.5-1.8z" />
          <path d="M19 14l.6 1.6L21 16l-1.4.6L19 18l-.6-1.4L17 16l1.4-.4z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "send":
      return (
        <svg {...common}>
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      );
    case "stop":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <rect x="6" y="6" width="12" height="12" rx="2.5" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
          <line x1="12" y1="9" x2="12" y2="13.5" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <polyline points="4 12 10 18 20 6" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <polyline points="9 6 15 12 9 18" />
        </svg>
      );
    case "return":
      return (
        <svg {...common}>
          <polyline points="9 10 4 15 9 20" />
          <path d="M20 4v7a4 4 0 0 1-4 4H4" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 14" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common}>
          <polygon points="3 4 21 4 14 12 14 19 10 21 10 12" />
        </svg>
      );
    case "sort":
      return (
        <svg {...common}>
          <path d="M7 4v16" />
          <path d="M3 8l4-4 4 4" />
          <path d="M17 20V4" />
          <path d="M21 16l-4 4-4-4" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 16V4" />
          <polyline points="6 10 12 4 18 10" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 4v12" />
          <polyline points="6 10 12 16 18 10" />
          <path d="M4 20h16" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
          <path d="M3 21v-5h5" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <polyline points="3 6 21 6" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "more":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      );
    case "key":
      return (
        <svg {...common}>
          <circle cx="7.5" cy="15.5" r="4" />
          <path d="M10.5 12.5 20 3" />
          <path d="M16 7l3 3" />
          <path d="M18 5l3 3" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 14" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
          <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "power":
      return (
        <svg {...common}>
          <path d="M12 4v8" />
          <path d="M7.5 6.5a8 8 0 1 0 9 0" />
        </svg>
      );
    case "play":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <polygon points="6 4 20 12 6 20" />
        </svg>
      );
    case "database":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </svg>
      );
    case "cloud":
      return (
        <svg {...common}>
          <path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6.5 19z" />
        </svg>
      );
    case "tag":
      return (
        <svg {...common}>
          <path d="M20.5 13.5 13 21l-9-9V4h8z" />
          <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "command":
      return (
        <svg {...common}>
          <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />
        </svg>
      );
    case "monitor":
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="19" height="13" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      );
    case "chevron-left":
      return (
        <svg {...common}>
          <polyline points="15 18 9 12 15 6" />
        </svg>
      );
    case "chevrons-ud":
      return (
        <svg {...common}>
          <polyline points="7 9 12 4 17 9" />
          <polyline points="7 15 12 20 17 15" />
        </svg>
      );
    case "arrow-up-down":
      return (
        <svg {...common}>
          <path d="M7 4v16" />
          <polyline points="3 8 7 4 11 8" />
          <path d="M17 20V4" />
          <polyline points="13 16 17 20 21 16" />
        </svg>
      );
    case "route":
      return (
        <svg {...common}>
          <circle cx="6" cy="19" r="2.5" />
          <circle cx="18" cy="5" r="2.5" />
          <path d="M8.5 19H14a4 4 0 0 0 0-8H10a4 4 0 0 1 0-8h5.5" />
        </svg>
      );
    case "fingerprint":
      return (
        <svg {...common}>
          <path d="M12 4a8 8 0 0 0-8 8v3" />
          <path d="M12 8a4 4 0 0 0-4 4v2a8 8 0 0 0 .5 3" />
          <path d="M12 12v3a5 5 0 0 0 .6 2.4" />
          <path d="M16 9.5A4 4 0 0 0 12 8" />
          <path d="M16 14a8 8 0 0 1-.4 2.5" />
          <path d="M8.5 19a10 10 0 0 0 7 0" />
        </svg>
      );
    case "shield-check":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "bookmark":
      return (
        <svg {...common}>
          <path d="M6 4h12v17l-6-4-6 4z" />
        </svg>
      );
    case "hash":
      return (
        <svg {...common}>
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="10" y1="3" x2="8" y2="21" />
          <line x1="16" y1="3" x2="14" y2="21" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "external":
      return (
        <svg {...common}>
          <path d="M14 4h6v6" />
          <path d="M20 4 10 14" />
          <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
      );
    case "folder-open":
      return (
        <svg {...common}>
          <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v1H4z" />
          <path d="M3.5 10h17l-1.5 8a2 2 0 0 1-2 1.7H6.4a2 2 0 0 1-2-1.6z" />
        </svg>
      );
    case "hard-drive":
      return (
        <svg {...common}>
          <path d="M4 13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
          <path d="M5 11 8 5a2 2 0 0 1 1.8-1.1h4.4A2 2 0 0 1 16 5l3 6" />
          <circle cx="8" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "alert-circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="13" />
          <line x1="12" y1="16.5" x2="12.01" y2="16.5" />
        </svg>
      );
    default:
      return null;
  }
}

Object.assign(window, {
  SESSION,
  PROVIDER,
  DEMO_REQUEST,
  PROMPT,
  SCROLLBACK,
  TIMELINE,
  formatDuration,
  lineTokens,
  nextId,
  Icon,
});

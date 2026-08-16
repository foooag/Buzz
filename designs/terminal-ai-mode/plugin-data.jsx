// plugin-data.jsx — mock registry + surface data for the AI plugin system.
//   Mirrors the plugin PRD: PluginInstallation-like records, two demo plugins
//   (Prod Health Board = scene A, CI/CD Pipeline = scene G), and "recipes"
//   that script the Plugin Studio creation flow (describe → draft → preview →
//   bind → test → install). Exported on window.PLUGINS.

/* ----------------------------------------------------------------------------
 * Registry (installed plugins)
 * ------------------------------------------------------------------------- */

const PLUGIN_REGISTRY = [
  {
    id: "buzz/health-board",
    name: "Prod Health Board",
    version: "1.2.0",
    publisher: "Buzz Labs",
    trust: "official", // T3
    icon: "gauge",
    accent: "pulse-green",
    summary: "CPU, memory, disk and failed services for a host group, with manual refresh.",
    surface: "health-board",
    pinned: true,
    enabled: true,
    dataSources: [
      { id: "ds-inv", kind: "buzz.inventory", title: "Inventory · Production group", binding: "group:production (4 hosts)" },
      { id: "ds-ssh", kind: "buzz.ssh", title: "SSH read-only probes", binding: "scope:group:production" },
    ],
    permissions: [
      "Read Inventory hosts & groups (non-secret view)",
      "Run read-only SSH probes on bound hosts",
      "Manual refresh only — no background polling",
    ],
  },
  {
    id: "buzz/cicd-pipeline",
    name: "CI/CD Pipeline",
    version: "0.9.3",
    publisher: "you (AI-generated)",
    trust: "local", // T0 local draft installed from studio
    icon: "workflow",
    accent: "signal-teal",
    summary: "GitLab merge requests, Jenkins build status and ArgoCD app health in one panel.",
    surface: "cicd",
    pinned: true,
    enabled: true,
    dataSources: [
      { id: "ds-gitlab", kind: "http.private", title: "GitLab · merge requests", binding: "https://gitlab.internal.io" },
      { id: "ds-jenkins", kind: "http.private", title: "Jenkins · builds", binding: "https://jenkins.internal.io:8080" },
      { id: "ds-argocd", kind: "http.private", title: "ArgoCD · apps", binding: "https://argocd.internal.io" },
    ],
    permissions: [
      "Read merge requests, builds and app health from 3 bound internal endpoints",
      "Trigger Jenkins build — confirmation required each run",
      "Rollback ArgoCD app — confirmation required each run",
      "Auto-refresh every 30 s while visible, paused when hidden",
    ],
  },
];

const TRUST_META = {
  official: { label: "Official", cls: "bg-acid-lime/12 text-acid-lime", rank: "T3" },
  verified: { label: "Market · verified", cls: "bg-pulse-green/12 text-pulse-green", rank: "T2" },
  private: { label: "Private link", cls: "bg-signal-teal/12 text-signal-teal", rank: "T1" },
  local: { label: "Local · unreviewed", cls: "bg-yellow-400/12 text-yellow-400", rank: "T0" },
};

const KIND_META = {
  "buzz.inventory": { label: "inventory", icon: "server" },
  "buzz.ssh": { label: "ssh", icon: "terminal" },
  "buzz.sftp": { label: "sftp", icon: "folder" },
  http: { label: "http", icon: "globe" },
  "http.private": { label: "http · private", icon: "lock" },
};

/* ----------------------------------------------------------------------------
 * Surface data — Prod Health Board (scene A)
 * ------------------------------------------------------------------------- */

const HEALTH_DATA = {
  metrics: [
    { id: "cpu", label: "CPU", value: 47, unit: "%", tone: "ok", spark: [38, 41, 44, 40, 47, 45, 47] },
    { id: "mem", label: "Memory", value: 62, unit: "%", tone: "ok", spark: [55, 57, 58, 60, 61, 62, 62] },
    { id: "disk", label: "Disk /", value: 49, unit: "%", tone: "ok", spark: [47, 47, 48, 48, 49, 49, 49] },
    { id: "load", label: "Load 1m", value: 0.42, unit: "", tone: "ok", spark: [0.3, 0.35, 0.4, 0.38, 0.44, 0.41, 0.42] },
  ],
  hosts: [
    { id: "h1", name: "web-prod-01", role: "nginx", status: "online", cpu: 31, mem: 48, disk: 44 },
    { id: "h2", name: "api-prod-01", role: "node api", status: "online", cpu: 52, mem: 61, disk: 47 },
    { id: "h3", name: "api-prod-02", role: "node api", status: "degraded", cpu: 88, mem: 84, disk: 51 },
    { id: "h4", name: "db-primary", role: "postgres", status: "online", cpu: 44, mem: 70, disk: 55 },
  ],
  alerts: [
    {
      id: "a1",
      level: "down",
      title: "nginx.service down on api-prod-02",
      detail: "systemctl is-active nginx → inactive (dead) since 21:04 UTC. Rest of the host is up; cpu 88% suggests the retry storm started first.",
      hint: "Read-only finding — the plugin takes no action. Ask the Agent to restart it (risk-gated).",
    },
  ],
};

/* ----------------------------------------------------------------------------
 * Surface data — CI/CD Pipeline (scene G)
 * ------------------------------------------------------------------------- */

const CICD_DATA = {
  mrs: [
    { id: 412, branch: "feat/rate-limit", author: "jchen", checks: "pass", review: "1/2", pipeline: "passed" },
    { id: 411, branch: "fix/db-pool-leak", author: "mara", checks: "pass", review: "2/2", pipeline: "passed" },
    { id: 410, branch: "chore/node-22", author: "dvo", checks: "pass", review: "0/2", pipeline: "running" },
    { id: 409, branch: "feat/dark-metrics", author: "jchen", checks: "fail", review: "0/2", pipeline: "failed" },
  ],
  builds: [
    { id: "b1", job: "api-backend", n: 1181, status: "success", durationMs: 161000, commit: "a1f9e2c", when: "12 min ago" },
    { id: "b2", job: "web-frontend", n: 892, status: "running", progress: 0.62, commit: "77d0b41", when: "running 1m 12s" },
    { id: "b3", job: "api-backend", n: 1180, status: "failed", durationMs: 88000, commit: "9c3e5aa", when: "38 min ago" },
  ],
  apps: [
    { id: "ap1", name: "api-backend", health: "Healthy", sync: "Synced", version: "v1.4.3", cluster: "prod-eu" },
    { id: "ap2", name: "web-frontend", health: "Degraded", sync: "OutOfSync", version: "v2.1.0", cluster: "prod-eu" },
  ],
};

/* Risk-gated operations surfaced by the CI/CD plugin (PRD §13.1 sensitive tier) */
const CICD_OPERATIONS = {
  triggerBuild: {
    id: "triggerBuild",
    title: "Trigger Jenkins build",
    badge: "high",
    target: "jenkins.internal.io:8080 · http.private (user-bound)",
    request: "POST /job/api-backend/build",
    why: "Starts a new build of api-backend on the shared prod pipeline. A green build is the last gate before the deploy job becomes eligible.",
    effect: "One api-backend build is queued on jenkins.internal.io. No deployment happens from this action alone.",
    confirmLabel: "Trigger build",
  },
  rollback: {
    id: "rollback",
    title: "Rollback ArgoCD app",
    badge: "high",
    target: "argocd.internal.io · http.private (user-bound)",
    request: "POST /api/v1/applications/web-frontend/rollback  { \"id\": 4211 }",
    why: "Rolls web-frontend back to the previous sync (v2.0.9). ArgoCD will re-render and force-sync manifests — a live traffic change.",
    effect: "web-frontend on prod-eu is redeployed at v2.0.9. In-flight sessions on v2.1.0 are drained.",
    confirmLabel: "Rollback to v2.0.9",
  },
};

/* ----------------------------------------------------------------------------
 * Studio recipes — script the creation flow per demo prompt
 * ------------------------------------------------------------------------- */

const STUDIO_RECIPES = [
  {
    id: "health-board",
    match: "health",
    example: "Make a Production group health board showing CPU, memory, disk and abnormal services, with manual refresh.",
    name: "Prod Health Board",
    icon: "gauge",
    accent: "pulse-green",
    surface: "health-board",
    stages: [
      { label: "Parsing your description", detail: "1 surface · 4 metric cards · host table · alerts" },
      { label: "Selecting data sources", detail: "buzz.inventory (groups, hosts) + buzz.ssh (read-only probes)" },
      { label: "Drafting Surface (buzz.ui/v1)", detail: "Metric ×4 · Table · Alert — standard catalog only" },
      { label: "Validating against catalog schema", detail: "props ✓ bindings ✓ action refs ✓" },
    ],
    definition: {
      apiVersion: "buzz.plugin/v1",
      surfaces: 1,
      catalog: "buzz.catalog@1 · standard components only",
      dataSources: [
        { kind: "buzz.inventory", ops: ["query hosts by group"] },
        { kind: "buzz.ssh", ops: ["probe cpu/mem/disk", "list failed units"] },
      ],
      permissions: ["inventory:read", "ssh:read (bound hosts)", "refresh:manual"],
    },
    permissions: [
      { group: "Inventory", items: ["Read hosts & groups — non-secret view"] },
      { group: "SSH", items: ["Read-only probes on hosts of the bound group"] },
      { group: "Refresh", items: ["Manual refresh only — no polling requested"] },
    ],
    bindings: [
      {
        id: "bind-group",
        kind: "buzz.inventory",
        title: "Host group",
        hint: "The board reads this group's hosts. Credentials never leave the vault.",
        type: "group",
        options: [
          { id: "production", label: "Production", meta: "4 hosts" },
          { id: "staging", label: "Staging", meta: "6 hosts" },
        ],
      },
    ],
    tests: [
      { id: "t1", label: "inventory.query hosts (group=production)", rows: 4, latencyMs: 38, schema: "✓ output matches schema" },
      { id: "t2", label: "ssh.probe metrics (4 hosts, read-only)", rows: 16, latencyMs: 412, schema: "✓ output matches schema" },
    ],
  },
  {
    id: "cicd",
    match: "ci",
    example: "Build a CI/CD panel that aggregates GitLab merge requests, Jenkins build status and ArgoCD app health.",
    name: "CI/CD Pipeline",
    icon: "workflow",
    accent: "signal-teal",
    surface: "cicd",
    stages: [
      { label: "Parsing your description", detail: "3 source sections · pipeline actions · auto-refresh" },
      { label: "Selecting data sources", detail: "http.private ×3 — GitLab, Jenkins, ArgoCD (user-bound endpoints)" },
      { label: "Drafting Surface (buzz.ui/v1)", detail: "Table ×2 · List · Action ×2 (risk-gated) — standard catalog" },
      { label: "Validating against catalog schema", detail: "props ✓ endpoints declared ✓ risk ops flagged ✓" },
    ],
    definition: {
      apiVersion: "buzz.plugin/v1",
      surfaces: 1,
      catalog: "buzz.catalog@1 · standard components only",
      dataSources: [
        { kind: "http.private", ops: ["GET /merge_requests", "GET /job/../builds"] },
        { kind: "http.private", ops: ["POST /job/api-backend/build ⚠ action"] },
        { kind: "http.private", ops: ["GET /applications", "POST rollback ⚠ action"] },
      ],
      permissions: ["http.private:read ×3", "http.private:action ×2 (confirm each run)", "polling:30s (visible only)"],
    },
    permissions: [
      { group: "Internal endpoints", items: ["Read from 3 endpoints you bind below", "Exact host:port + path prefix match — no redirects across endpoints"] },
      { group: "Actions", items: ["Trigger Jenkins build — confirm each run", "Rollback ArgoCD app — confirm each run"] },
      { group: "Refresh", items: ["Poll every 30 s while the surface is visible, paused when hidden"] },
    ],
    bindings: [
      {
        id: "bind-gitlab",
        kind: "http.private",
        title: "GitLab",
        hint: "PAT stored in vault, injected by the connection template.",
        type: "endpoint",
        template: "GitLab CE · PAT header",
        url: "https://gitlab.internal.io",
        path: "/api/v4",
      },
      {
        id: "bind-jenkins",
        kind: "http.private",
        title: "Jenkins",
        hint: "API token stored in vault — never returned to the plugin.",
        type: "endpoint",
        template: "Jenkins · Basic + API token",
        url: "https://jenkins.internal.io:8080",
        path: "/job/api-backend",
      },
      {
        id: "bind-argocd",
        kind: "http.private",
        title: "ArgoCD",
        hint: "Bearer token stored in vault. Self-signed CA accepted for this endpoint.",
        type: "endpoint",
        template: "ArgoCD · Bearer token",
        url: "https://argocd.internal.io",
        path: "/api/v1",
      },
    ],
    tests: [
      { id: "t1", label: "GET gitlab.internal.io/api/v4/merge_requests", rows: 4, latencyMs: 121, schema: "✓ output matches schema" },
      { id: "t2", label: "GET jenkins.internal.io:8080/job/api-backend/builds", rows: 3, latencyMs: 96, schema: "✓ output matches schema" },
      { id: "t3", label: "GET argocd.internal.io/api/v1/applications", rows: 2, latencyMs: 143, schema: "✓ output matches schema" },
    ],
  },
];

Object.assign(window, {
  PLUGINS: {
    REGISTRY: PLUGIN_REGISTRY,
    TRUST_META,
    KIND_META,
    HEALTH_DATA,
    CICD_DATA,
    CICD_OPERATIONS,
    STUDIO_RECIPES,
  },
});

// plugin-surfaces.jsx — presentational plugin chrome & surfaces:
//   PlTrustBadge / PlKindBadge      trust + data-source badges
//   PlStatusDot / PlSparkline       tiny metric visuals
//   HealthBoardSurface              scene A board (read-only, manual refresh)
//   CicdSurface                     scene G panel (3 sections, risk actions)
//   PluginRiskDialog                one-shot risk confirm (AgentConfirm style)
//   PluginPageView                  standalone plugin page wrapper
// Exported to `window`.

const { useState, useEffect } = React;
const { Icon, formatDuration } = window;
const { TRUST_META, KIND_META, HEALTH_DATA, CICD_DATA, CICD_OPERATIONS } = window.PLUGINS;

/* ----------------------------------------------------------------------------
 * Small badges & bits
 * ------------------------------------------------------------------------- */

function PlTrustBadge({ trust }) {
  const t = TRUST_META[trust] ?? TRUST_META.local;
  return (
    <span
      title={"Trust " + t.rank}
      className={"inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] " + t.cls}
    >
      <Icon name={trust === "official" || trust === "verified" ? "shield-check" : "shield"} size={10} />
      {t.label}
    </span>
  );
}

function PlKindBadge({ kind }) {
  const k = KIND_META[kind] ?? KIND_META.http;
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-graphite/80 px-2 py-0.5 font-mono text-[10.5px] text-fog">
      <Icon name={k.icon} size={10} className="text-fog/60" />
      {k.label}
    </span>
  );
}

function PlStatusDot({ status, size = 7 }) {
  const cls =
    status === "online" || status === "success" || status === "passed" || status === "Healthy" || status === "Synced"
      ? "bg-pulse-green"
      : status === "degraded" || status === "failed" || status === "Degraded" || status === "OutOfSync" || status === "down"
      ? "bg-coral-red"
      : status === "running"
      ? "bg-yellow-400"
      : "bg-fog/45";
  return <span aria-hidden="true" className={"inline-block shrink-0 rounded-full " + cls} style={{ width: size, height: size }} />;
}

function PlSparkline({ points, tone = "acid-lime", w = 64, h = 20 }) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - 2 - ((p - min) / span) * (h - 4);
      return (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
    })
    .join(" ");
  const stroke = tone === "pulse-green" ? "#27a644" : tone === "coral" ? "#eb5757" : "#e4f222";
  return (
    <svg width={w} height={h} viewBox={"0 0 " + w + " " + h} fill="none" aria-hidden="true" className="shrink-0">
      <path d={d} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

function PlMeterBar({ value, danger }) {
  const pct = Math.max(2, Math.min(100, value));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-smoke/60">
      <div
        className={"h-full rounded-full transition-all " + (danger ? "bg-coral-red" : pct > 75 ? "bg-yellow-400" : "bg-pulse-green")}
        style={{ width: pct + "%" }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Health Board surface (scene A — read-only + manual refresh)
 * ------------------------------------------------------------------------- */

function HealthBoardSurface({ data, metricCols }) {
  const d = data ?? HEALTH_DATA;
  const cols = Math.max(1, Math.min(4, metricCols ?? 4));
  return (
    <div className="grid gap-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(" + cols + ", minmax(0, 1fr))" }}>
      {d.metrics.map((m) => {
        const danger = m.id === "load" ? m.value > 1 : m.value > 80;
        return (
          <div key={m.id} className="rounded-xl border border-graphite bg-obsidian/40 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fog">{m.label}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className={"font-mono text-[22px] font-semibold leading-none " + (danger ? "text-coral-red" : "text-paper")}>
                    {m.id === "load" ? m.value.toFixed(2) : m.value}
                  </span>
                  <span className="text-[12px] text-fog">{m.unit}</span>
                </div>
              </div>
              <PlSparkline points={m.spark} tone={danger ? "coral" : "pulse-green"} />
            </div>
          </div>
        );
      })}
      </div>

      <div className="overflow-hidden rounded-xl border border-graphite bg-obsidian/40">
        <div className="flex items-center justify-between border-b border-graphite px-3.5 py-2.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold tracking-tight text-mist">
            <Icon name="server" size={13} className="text-fog" />
            Hosts · Production
          </div>
          <span className="font-mono text-[10.5px] text-fog">ssh.probe · read-only</span>
        </div>
        <table className="w-full table-fixed text-left">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-[0.06em] text-fog">
              <th className="w-[26%] px-3.5 py-2 font-medium">Host</th>
              <th className="w-[16%] px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">CPU</th>
              <th className="px-2 py-2 font-medium">Memory</th>
              <th className="px-2 py-2 font-medium">Disk</th>
            </tr>
          </thead>
          <tbody>
            {d.hosts.map((h) => (
              <tr key={h.id} className="border-t border-graphite/60 text-[12.5px]">
                <td className="px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <PlStatusDot status={h.status} />
                    <span className="truncate font-mono text-mist">{h.name}</span>
                  </div>
                  <div className="mt-0.5 pl-[15px] text-[10.5px] text-fog">{h.role}</div>
                </td>
                <td className="px-2 py-2.5">
                  <span className={"text-[11.5px] " + (h.status === "online" ? "text-pulse-green" : "text-coral-red")}>
                    {h.status}
                  </span>
                </td>
                {["cpu", "mem", "disk"].map((k) => (
                  <td key={k} className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-8 shrink-0 font-mono text-[11.5px] text-fog">{h[k]}%</span>
                      <div className="w-full min-w-0">
                        <PlMeterBar value={h[k]} />
                      </div>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.alerts.map((a) => (
        <div
          key={a.id}
          className="rounded-xl border border-coral-red/30 bg-coral-red/[0.06] p-3.5"
        >
          <div className="flex items-start gap-2.5">
            <Icon name="alert-circle" size={15} className="mt-0.5 shrink-0 text-coral-red" />
            <div className="min-w-0">
              <p className="m-0 text-[13px] font-medium text-mist">{a.title}</p>
              <p className="m-0 mt-1 text-[12px] leading-relaxed text-fog">{a.detail}</p>
              <p className="m-0 mt-1.5 text-[11px] italic text-fog/70">{a.hint}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * CI/CD surface (scene G — 3 sections, risk-gated actions)
 * ------------------------------------------------------------------------- */

function CicdPipelinePill({ state }) {
  const map = {
    passed: { cls: "bg-pulse-green/12 text-pulse-green", icon: "check" },
    running: { cls: "bg-yellow-400/12 text-yellow-400", icon: "clock" },
    failed: { cls: "bg-coral-red/12 text-coral-red", icon: "x" },
  };
  const s = map[state] ?? map.passed;
  return (
    <span className={"inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-semibold " + s.cls}>
      <Icon name={s.icon} size={10} />
      {state}
    </span>
  );
}

function CicdSection({ icon, title, endpoint, kind, action, children, compact }) {
  return (
    <section className="overflow-hidden rounded-xl border border-graphite bg-obsidian/40">
      <div className="flex flex-wrap items-center gap-2 border-b border-graphite px-3.5 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-graphite text-mist">
          <Icon name={icon} size={13} />
        </span>
        <span className="text-[12.5px] font-semibold tracking-tight text-mist">{title}</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden truncate font-mono text-[10.5px] text-fog sm:inline">{endpoint}</span>
          <PlKindBadge kind={kind} />
        </span>
        {action ? <div className="w-full pt-1 sm:w-auto sm:pt-0">{action}</div> : null}
      </div>
      <div className={compact ? "p-2" : "p-3"}>{children}</div>
    </section>
  );
}

function CicdSurface({ data, onOperation, compact, wide, opStates }) {
  const d = data ?? CICD_DATA;
  const states = opStates ?? {};
  const smallBtn =
    "inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-fog transition-colors hover:bg-white/5 hover:text-mist";
  const triggerState = states.triggerBuild;
  const rollbackState = states.rollback;

  return (
    <div
      className="grid gap-3"
      style={wide ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } : undefined}
    >
      {/* GitLab MRs */}
      <CicdSection icon="git-branch" title="Merge requests" endpoint="gitlab.internal.io/api/v4" kind="http.private" compact={compact}>
        <div className="grid gap-1">
          {d.mrs.map((mr) => (
            <div
              key={mr.id}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03] sm:px-2.5"
            >
              <span className="w-9 shrink-0 font-mono text-[11px] text-fog">!{mr.id}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-mist">{mr.branch}</span>
              <span className="hidden w-14 shrink-0 truncate text-[11px] text-fog sm:inline">{mr.author}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-fog/70">{mr.checks === "pass" ? "✓" : "✗"} {mr.review}</span>
              <CicdPipelinePill state={mr.pipeline} />
            </div>
          ))}
        </div>
      </CicdSection>

      {/* Jenkins builds */}
      <CicdSection
        icon="box"
        title="Builds"
        endpoint="jenkins.internal.io:8080"
        kind="http.private"
        compact={compact}
        action={
          <button
            type="button"
            onClick={() => onOperation?.("triggerBuild")}
            disabled={triggerState === "running" || triggerState === "done"}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold tracking-tight transition-colors " +
              (triggerState === "done"
                ? "bg-pulse-green/15 text-pulse-green"
                : triggerState === "running"
                ? "bg-graphite text-fog"
                : "bg-acid-lime text-void hover:brightness-105")
            }
          >
            <Icon name={triggerState === "done" ? "check" : "play"} size={12} />
            {triggerState === "running" ? "Queueing…" : triggerState === "done" ? "Queued · #1182" : "Trigger build"}
          </button>
        }
      >
        <div className="grid gap-1">
          {d.builds.map((b) => (
            <div key={b.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03] sm:px-2.5">
              <PlStatusDot status={b.status} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-mist">
                <span className="font-mono">{b.job}</span>
                <span className="text-fog"> #{b.n}</span>
              </span>
              <span className="hidden shrink-0 font-mono text-[10.5px] text-fog/70 md:inline">{b.commit}</span>
              {b.status === "running" ? (
                <span className="flex w-24 shrink-0 items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-smoke/60">
                    <span className="block h-full rounded-full bg-yellow-400" style={{ width: Math.round(b.progress * 100) + "%" }} />
                  </span>
                </span>
              ) : (
                <span className="w-24 shrink-0 text-right font-mono text-[10.5px] text-fog">
                  {b.status === "failed" ? "exit 1 · " : ""}
                  {formatDuration(b.durationMs)}
                </span>
              )}
              <CicdPipelinePill state={b.status === "running" ? "running" : b.status} />
            </div>
          ))}
        </div>
      </CicdSection>

      {/* ArgoCD apps */}
      <CicdSection icon="rocket" title="Apps · prod-eu" endpoint="argocd.internal.io/api/v1" kind="http.private" compact={compact}>
        <div className="grid gap-1">
          {d.apps.map((app) => (
            <div
              key={app.id}
              className={
                "flex flex-wrap items-center gap-2.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.03] sm:px-2.5 " +
                (app.health === "Degraded" ? "bg-coral-red/[0.05]" : "")
              }
            >
              <PlStatusDot status={app.health} />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-mist">{app.name}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-fog">{app.version}</span>
              <span className={"shrink-0 text-[11px] " + (app.health === "Healthy" ? "text-pulse-green" : "text-coral-red")}>{app.health}</span>
              <span className={"shrink-0 text-[11px] " + (app.sync === "Synced" ? "text-fog" : "text-yellow-400")}>{app.sync}</span>
              {app.health === "Degraded" ? (
                <button
                  type="button"
                  onClick={() => onOperation?.("rollback")}
                  disabled={rollbackState === "running" || rollbackState === "done"}
                  className={
                    "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-semibold tracking-tight transition-colors " +
                    (rollbackState === "done"
                      ? "bg-pulse-green/15 text-pulse-green"
                      : rollbackState === "running"
                      ? "bg-graphite text-fog"
                      : "bg-coral-red/90 text-paper hover:brightness-110")
                  }
                >
                  <Icon name={rollbackState === "done" ? "check" : "rotate"} size={11} />
                  {rollbackState === "running" ? "Rolling back…" : rollbackState === "done" ? "Rolled back" : "Rollback"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </CicdSection>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Risk confirm dialog (one-shot, per PRD §13.1 sensitive tier)
 * ------------------------------------------------------------------------- */

function PluginRiskDialog({ op, onResolve }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onResolve("cancel");
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onResolve("confirm");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResolve]);

  const spec = CICD_OPERATIONS[op] ?? op;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/75 p-4 backdrop-blur-sm"
      onMouseDown={() => onResolve("cancel")}
    >
      <div
        className="pop-in w-[min(560px,92vw)] overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_24px_80px_rgb(0_0_0/0.6)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-graphite px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-coral-red/12 text-coral-red">
            <Icon name="alert" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">{spec.title}</h2>
              <span className="rounded-pill bg-coral-red/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-coral-red">
                {spec.badge}
              </span>
              <span className="rounded-pill bg-graphite px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog">
                one-shot
              </span>
            </div>
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[12px] text-fog">
              <Icon name="puzzle" size={12} />
              Requested by plugin · CI/CD Pipeline v0.9.3 · approval is never remembered.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
              <Icon name="terminal" size={12} />
              Exact request
            </div>
            <div className="rounded-md border border-smoke bg-black/50 px-2.5 py-2 font-mono text-[12.5px] leading-relaxed text-mist">
              <span className="select-none text-coral-red/80">$</span>{" "}
              <span className="c-white">{spec.request}</span>
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
              <Icon name="lock" size={12} />
              Target
            </div>
            <p className="m-0 font-mono text-[12px] text-mist">{spec.target}</p>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-coral-red">
              <Icon name="alert" size={12} />
              Why this is risky
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-mist">{spec.why}</p>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
              <Icon name="chevron-right" size={12} />
              What will happen
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-mist">{spec.effect}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-graphite bg-obsidian/40 px-5 py-3.5">
          <button
            type="button"
            onClick={() => onResolve("cancel")}
            className="rounded-md px-3 py-2 text-[13px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-fog sm:inline">
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px]">⌘⏎</kbd> confirm ·{" "}
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px]">Esc</kbd> cancel
            </span>
            <button
              type="button"
              onClick={() => onResolve("confirm")}
              className="rounded-md bg-acid-lime px-4 py-2 text-[13px] font-semibold tracking-tight text-void transition hover:brightness-105"
            >
              {spec.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* small local switch — mirrors views.jsx Switch */
function PlSwitch({ on, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={() => onChange(!on)}
      className={"relative h-[20px] w-[34px] rounded-full transition-colors " + (on ? "bg-acid-lime/80" : "bg-smoke")}
    >
      <span className={"absolute top-[2px] h-4 w-4 rounded-full bg-paper transition-all " + (on ? "left-[16px]" : "left-[2px]")} />
    </button>
  );
}

Object.assign(window, {
  PlTrustBadge,
  PlKindBadge,
  PlStatusDot,
  HealthBoardSurface,
  CicdSurface,
  PluginRiskDialog,
  PlSwitch,
});

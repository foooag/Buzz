// plugins.jsx — Plugin Center + Plugin Studio (AI creation flow).
//   PluginCenterView   installed-plugin grid, create entry
//   PluginStudio       describe → draft (streamed) → mock preview →
//                      bind data → read-only test → install grants
// Exported to `window`.

const { useState, useEffect, useRef, useCallback } = React;
const { Icon } = window;
const { TRUST_META, KIND_META, HEALTH_DATA, CICD_DATA, STUDIO_RECIPES } = window.PLUGINS;
const { PlTrustBadge, PlKindBadge, HealthBoardSurface, CicdSurface, PlSwitch, PluginRiskDialog } = window;

const ACCENT_TILE = {
  "pulse-green": "bg-pulse-green/15 text-pulse-green",
  "signal-teal": "bg-signal-teal/15 text-signal-teal",
  "acid-lime": "bg-acid-lime/15 text-acid-lime",
  "iris-violet": "bg-iris-violet/15 text-lavender",
};

function accentTile(accent) {
  return ACCENT_TILE[accent] ?? ACCENT_TILE["acid-lime"];
}

/* ----------------------------------------------------------------------------
 * Plugin Center — adaptive resizable grid dashboard. Every installed plugin
 * is visible at once; drag a tile corner to resize (snaps to grid units,
 * layout persists locally). Enable/uninstall live in Preferences → Plugins.
 * ------------------------------------------------------------------------- */

const GRID_COLS = 12;
const ROW_UNIT = 44;
const GRID_GAP = 10;
const SPAN_MIN = { w: 3, h: 4 };
const SPAN_MAX = { w: 12, h: 16 };
const DEFAULT_SPANS = {
  "buzz/health-board": { w: 6, h: 9 },
  "buzz/cicd-pipeline": { w: 6, h: 11 },
};
const LAYOUT_KEY = "buzz.pluginLayout.v1";

function loadLayout() {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {};
  } catch {
    return {};
  }
}

function clampSpan(w, h) {
  return {
    w: Math.max(SPAN_MIN.w, Math.min(SPAN_MAX.w, w)),
    h: Math.max(SPAN_MIN.h, Math.min(SPAN_MAX.h, h)),
  };
}

function spanOf(pluginId, spans) {
  return clampSpan(
    (spans[pluginId] ?? DEFAULT_SPANS[pluginId] ?? { w: 6, h: 9 }).w,
    (spans[pluginId] ?? DEFAULT_SPANS[pluginId] ?? { w: 6, h: 9 }).h,
  );
}

/* ---- single dashboard tile ------------------------------------------- */

function PluginTile({ plugin, span, tileW, highlighted, isDragging, setTileRef, onResizeStart }) {
  const [refreshing, setRefreshing] = useState(false);
  const [op, setOp] = useState(null);
  const [opStates, setOpStates] = useState({});

  const refresh = () => {
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 650);
  };

  const resolveOp = (result) => {
    if (result === "confirm" && op) {
      setOpStates((prev) => ({ ...prev, [op]: "running" }));
      const current = op;
      window.setTimeout(() => {
        setOpStates((prev) => ({ ...prev, [current]: "done" }));
      }, 1100);
    }
    setOp(null);
  };

  const metricCols = tileW < 340 ? 1 : tileW < 520 ? 2 : 4;
  const wide = tileW >= 660;

  return (
    <section
      ref={setTileRef}
      data-screen-label={"Plugin tile · " + plugin.name}
      style={{ gridColumn: "span " + span.w, gridRow: "span " + span.h }}
      className={
        "group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-obsidian/40 transition-shadow " +
        (isDragging ? "border-acid-lime/60 shadow-[0_0_0_1px_rgba(228,242,34,0.35)]" : "border-graphite") +
        (highlighted ? " ring-2 ring-acid-lime/60" : "")
      }
    >
      {/* tile header */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-graphite bg-carbon px-3 py-2">
        <span className={"grid h-6 w-6 shrink-0 place-items-center rounded-md " + accentTile(plugin.accent)}>
          <Icon name={plugin.icon} size={13} />
        </span>
        <span className={"truncate text-[12.5px] font-semibold tracking-tight " + (plugin.enabled ? "text-paper" : "text-fog")}>
          {plugin.name}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-fog/80">v{plugin.version}</span>
        {tileW >= 460 ? <PlTrustBadge trust={plugin.trust} /> : null}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {plugin.surface === "cicd" && plugin.enabled ? (
            <span
              title="F28 — polling pauses when this tile is hidden"
              className="hidden items-center gap-1.5 rounded-pill bg-graphite/70 px-2 py-0.5 text-[10.5px] text-fog md:inline-flex"
            >
              <span className="standby-dot h-[5px] w-[5px] rounded-full bg-pulse-green" />
              30s
            </span>
          ) : null}
          <button
            type="button"
            onClick={refresh}
            aria-label={"Refresh " + plugin.name}
            title="Refresh (reads bound sources only)"
            className="grid h-6 w-6 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            <Icon name="refresh" size={13} className={refreshing ? "spin" : undefined} />
          </button>
        </span>
      </div>

      {/* tile body */}
      {plugin.enabled ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
          {plugin.surface === "health-board" ? (
            <HealthBoardSurface metricCols={metricCols} />
          ) : (
            <CicdSurface compact={!wide} wide={wide} onOperation={(opId) => setOp(opId)} opStates={opStates} />
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-graphite bg-obsidian/60 text-fog">
            <Icon name="power" size={18} />
          </span>
          <p className="m-0 mt-2 text-[12px] font-semibold text-mist">Disabled</p>
          <p className="m-0 mt-0.5 max-w-[240px] text-[11px] leading-relaxed text-fog">
            Surfaces suspended — re-enable in Preferences → Plugins.
          </p>
        </div>
      )}

      {/* resize grip */}
      <span
        data-resize-handle
        aria-hidden="true"
        onPointerDown={(e) => onResizeStart(e, plugin.id)}
        className={
          "absolute bottom-0 right-0 grid h-[18px] w-[18px] cursor-nwse-resize place-items-center text-fog transition-opacity " +
          (isDragging ? "opacity-90" : "opacity-0 group-hover:opacity-70")
        }
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M9 5.5 5.5 9M9 1.5 1.5 9" />
        </svg>
      </span>

      {op ? <PluginRiskDialog op={op} onResolve={resolveOp} /> : null}
    </section>
  );
}

/* ---- center: adaptive grid -------------------------------------------- */

function PluginCenterView({ plugins, highlightId, onCreate }) {
  const [spans, setSpans] = useState(loadLayout);
  const [draggingId, setDraggingId] = useState(null);
  const [gridW, setGridW] = useState(1200);
  const gridRef = useRef(null);
  const tileRefs = useRef({});

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setGridW(el.clientWidth));
    ro.observe(el);
    setGridW(el.clientWidth);
    return () => ro.disconnect();
  }, [plugins.length]);

  useEffect(() => {
    if (!highlightId) return;
    const el = tileRefs.current[highlightId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, plugins.length]);

  const resetLayout = () => {
    setSpans({});
    try {
      localStorage.removeItem(LAYOUT_KEY);
    } catch {}
  };

  const beginResize = (e, id) => {
    e.preventDefault();
    const tileEl = tileRefs.current[id];
    const grid = gridRef.current;
    if (!tileEl || !grid) return;
    const rect = tileEl.getBoundingClientRect();
    const colUnit = (grid.clientWidth - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
    const startX = e.clientX;
    const startY = e.clientY;
    let last = spanOf(id, spans);
    setDraggingId(id);
    const move = (ev) => {
      const desiredW = rect.width + (ev.clientX - startX);
      const desiredH = rect.height + (ev.clientY - startY);
      last = clampSpan(
        Math.round((desiredW + GRID_GAP) / (colUnit + GRID_GAP)),
        Math.round((desiredH + GRID_GAP) / (ROW_UNIT + GRID_GAP)),
      );
      setSpans((prev) => ({ ...prev, [id]: last }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDraggingId(null);
      try {
        const stored = loadLayout();
        stored[id] = last;
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(stored));
      } catch {}
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const colUnit = (gridW - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-screen-label="Plugin Center">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-graphite text-mist">
            <Icon name="puzzle" size={16} />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 text-[16px] font-semibold tracking-tight text-paper">Plugins</h1>
            <p className="m-0 mt-0.5 text-[12px] text-fog">
              All surfaces on one board — drag a tile corner to resize. Enable &amp; uninstall from Preferences.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {plugins.length > 0 ? (
            <button
              type="button"
              onClick={resetLayout}
              className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-2 text-[12px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              <Icon name="rotate" size={13} />
              Reset layout
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-1.5 rounded-md bg-acid-lime px-3 py-2 text-[12.5px] font-semibold tracking-tight text-void transition hover:brightness-105"
          >
            <Icon name="sparkles" size={14} />
            Create with AI
          </button>
        </div>
      </div>

      {plugins.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <div className="flex flex-col items-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-graphite bg-obsidian/60 text-fog">
              <Icon name="puzzle" size={22} />
            </span>
            <h3 className="m-0 mt-3 text-[14px] font-semibold text-mist">No plugins installed</h3>
            <p className="m-0 mt-1 max-w-[340px] text-[12.5px] leading-relaxed text-fog">
              Describe what you need — “a health board for Production”, “a CI/CD panel” — and Buzz drafts it with mock data first.
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-acid-lime px-3.5 py-2 text-[12.5px] font-semibold tracking-tight text-void transition hover:brightness-105"
            >
              <Icon name="sparkles" size={14} />
              Create your first plugin
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={gridRef}
          className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5"
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(" + GRID_COLS + ", minmax(0, 1fr))",
              gridAutoRows: ROW_UNIT + "px",
              gap: GRID_GAP + "px",
              gridAutoFlow: "dense",
            }}
          >
            {plugins.map((p) => {
              const span = spanOf(p.id, spans);
              const tileW = (colUnit + GRID_GAP) * span.w - GRID_GAP;
              return (
                <PluginTile
                  key={p.id}
                  plugin={p}
                  span={span}
                  tileW={tileW}
                  highlighted={highlightId === p.id}
                  isDragging={draggingId === p.id}
                  setTileRef={(el) => {
                    tileRefs.current[p.id] = el;
                  }}
                  onResizeStart={beginResize}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Plugin Studio — step rail
 * ------------------------------------------------------------------------- */

const STUDIO_STEPS = ["Describe", "Draft", "Preview", "Bind data", "Test", "Install"];

function StudioRail({ step, maxStep, onJump }) {
  return (
    <nav aria-label="Studio steps" className="grid gap-0.5">
      {STUDIO_STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        const reachable = i <= maxStep;
        return (
          <button
            key={label}
            type="button"
            disabled={!reachable}
            onClick={() => reachable && onJump(i)}
            className={
              "flex min-h-[38px] items-center gap-2.5 rounded-[10px] px-3 text-left text-[12.5px] transition-colors " +
              (active
                ? "bg-graphite text-mist shadow-[inset_3px_0_#e4f222]"
                : reachable
                ? "text-fog hover:bg-white/5 hover:text-mist"
                : "cursor-default text-fog/40")
            }
          >
            <span
              className={
                "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border text-[10.5px] font-semibold " +
                (done
                  ? "border-acid-lime/50 bg-acid-lime/15 text-acid-lime"
                  : active
                  ? "border-acid-lime/60 text-acid-lime"
                  : reachable
                  ? "border-smoke text-fog"
                  : "border-graphite text-fog/40")
              }
            >
              {done ? <Icon name="check" size={11} /> : i + 1}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}

/* ----------------------------------------------------------------------------
 * Studio — step 1: describe
 * ------------------------------------------------------------------------- */

function StudioDescribe({ onGenerate }) {
  const [value, setValue] = useState("");
  const canGenerate = value.trim().length > 0;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-10">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-acid-lime/12 text-acid-lime">
        <Icon name="sparkles" size={22} />
      </span>
      <h2 className="m-0 mt-3.5 text-[19px] font-semibold tracking-tight text-paper">What should the plugin do?</h2>
      <p className="m-0 mt-1.5 max-w-[420px] text-center text-[13px] leading-relaxed text-fog">
        Describe the data you want to see and the actions you need. Buzz drafts the plugin with mock data first — nothing touches real sources until you bind them.
      </p>

      <div className="mt-5 w-full rounded-xl border border-graphite bg-obsidian/50 px-3.5 py-3 transition-colors focus-within:border-smoke">
        <textarea
          autoFocus
          rows={3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canGenerate) {
              e.preventDefault();
              onGenerate(value.trim());
            }
          }}
          placeholder="e.g. Make a CI/CD panel that aggregates GitLab MRs, Jenkins builds and ArgoCD health…"
          className="w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-mist outline-none placeholder:text-fog/55"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="font-mono text-[10.5px] text-fog/60">no credentials · draft only</span>
          <button
            type="button"
            disabled={!canGenerate}
            onClick={() => onGenerate(value.trim())}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold tracking-tight transition-colors " +
              (canGenerate ? "bg-acid-lime text-void hover:brightness-105" : "bg-graphite text-fog")
            }
          >
            <Icon name="zap" size={13} />
            Generate draft
            <kbd className="ml-1 rounded border border-void/20 px-1 font-sans text-[9.5px] opacity-70">⌘⏎</kbd>
          </button>
        </div>
      </div>

      <div className="mt-4 flex w-full flex-col items-center gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fog/70">Try an example</span>
        <div className="grid w-full gap-2">
          {STUDIO_RECIPES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onGenerate(r.example)}
              className="group flex items-start gap-2.5 rounded-xl border border-graphite bg-obsidian/40 px-3.5 py-2.5 text-left transition-colors hover:border-smoke hover:bg-graphite/40"
            >
              <span className={"mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md " + accentTile(r.accent)}>
                <Icon name={r.icon} size={13} />
              </span>
              <span className="text-[12.5px] leading-relaxed text-fog transition-colors group-hover:text-mist">{r.example}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Studio — step 2: streaming draft
 * ------------------------------------------------------------------------- */

function StudioDraft({ recipe, stageCount, done, onContinue }) {
  const def = recipe.definition;
  return (
    <div className="mx-auto grid w-full max-w-4xl flex-1 grid-cols-1 gap-4 px-6 py-8 lg:grid-cols-[1fr_1fr]">
      {/* streamed stage log */}
      <div className="rounded-xl border border-graphite bg-obsidian/40 p-4">
        <div className="flex items-center gap-2 border-b border-graphite pb-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-acid-lime/12 text-acid-lime">
            <Icon name="sparkles" size={13} />
          </span>
          <span className="text-[12.5px] font-semibold tracking-tight text-mist">Drafting “{recipe.name}”</span>
          {done ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded-pill bg-pulse-green/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-pulse-green">
              <Icon name="check" size={10} />
              valid
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid gap-3">
          {recipe.stages.slice(0, stageCount).map((s, i) => {
            const isLast = i === stageCount - 1 && !done;
            const complete = i < stageCount - 1 || done;
            return (
              <div key={i} className="rise-in flex items-start gap-2.5">
                <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center">
                  {complete ? (
                    <Icon name="check" size={13} className="text-pulse-green" />
                  ) : (
                    <span className="standby-dot block h-[7px] w-[7px] rounded-full bg-acid-lime" />
                  )}
                </span>
                <div className={"min-w-0 " + (isLast ? "stream-caret" : "")}>
                  <p className="m-0 text-[12.5px] font-medium text-mist">{s.label}</p>
                  <p className="m-0 mt-0.5 font-mono text-[11px] leading-relaxed text-fog/80">{s.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* definition card */}
      {done ? (
        <div className="pop-in overflow-hidden rounded-xl border border-graphite bg-obsidian/40">
          <div className="flex items-center gap-2 border-b border-graphite px-4 py-2.5">
            <Icon name="file" size={13} className="text-fog" />
            <span className="font-mono text-[11.5px] text-mist">definition.json</span>
            <span className="ml-auto rounded-pill bg-graphite px-2 py-0.5 font-mono text-[10px] text-fog">{def.apiVersion}</span>
          </div>
          <div className="grid gap-2.5 px-4 py-3.5 text-[12px]">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fog/70">Surfaces</div>
              <p className="m-0 mt-1 text-mist">
                {def.surfaces} surface · <span className="font-mono text-[11px] text-fog">{def.catalog}</span>
              </p>
            </div>
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fog/70">Data sources</div>
              <div className="mt-1 grid gap-1.5">
                {def.dataSources.map((ds, i) => (
                  <div key={i} className="rounded-lg border border-graphite/80 px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <PlKindBadge kind={ds.kind} />
                      <span className="truncate font-mono text-[10.5px] text-fog">{ds.ops[0]}</span>
                      {ds.ops.length > 1 ? <span className="font-mono text-[10.5px] text-fog/60">+{ds.ops.length - 1}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fog/70">Permissions requested</div>
              <ul className="m-0 mt-1 grid list-none gap-1 p-0">
                {def.permissions.map((p, i) => (
                  <li key={i} className="flex items-start gap-1.5 font-mono text-[11px] leading-relaxed text-fog">
                    <Icon name="shield" size={11} className="mt-[3px] shrink-0 text-fog/60" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-graphite bg-obsidian/40 px-4 py-3">
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex items-center gap-1.5 rounded-md bg-acid-lime px-3.5 py-2 text-[12.5px] font-semibold tracking-tight text-void transition hover:brightness-105"
            >
              Preview with mock data
              <Icon name="chevron-right" size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div className="hidden rounded-xl border border-graphite/60 bg-obsidian/20 lg:block">
          <div className="grid h-full place-items-center px-6 text-center">
            <p className="m-0 font-mono text-[11.5px] text-fog/50">definition.json appears here once the schema check passes…</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Studio — step 3: mock preview
 * ------------------------------------------------------------------------- */

function StudioPreview({ recipe, size, setSize, onContinue, onBack }) {
  const [flowOpen, setFlowOpen] = useState(true);
  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-4 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col">
        {/* toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-graphite">
            {[
              { id: "page", label: "Desktop page", icon: "monitor" },
              { id: "agent", label: "Agent card", icon: "sparkles" },
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSize(o.id)}
                className={
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] transition-colors " +
                  (size === o.id ? "bg-graphite text-paper" : "text-fog hover:bg-white/5 hover:text-mist")
                }
              >
                <Icon name={o.icon} size={12} />
                {o.label}
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-yellow-400/10 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-yellow-400">
            <Icon name="alert-circle" size={11} />
            simulated data
          </span>
          <span className="hidden font-mono text-[10.5px] text-fog/70 md:inline">
            no vault reads · no ssh · no network
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={onBack}
              className="rounded-md px-2.5 py-1.5 text-[12px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              Back
            </button>
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex items-center gap-1.5 rounded-md bg-acid-lime px-3.5 py-1.5 text-[12.5px] font-semibold tracking-tight text-void transition hover:brightness-105"
            >
              Bind real data
              <Icon name="chevron-right" size={13} />
            </button>
          </div>
        </div>

        {size === "page" ? (
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-dashed border-smoke/70 bg-void/60">
            <div className="scroll-thin h-full overflow-y-auto p-4">
              <div className="mx-auto max-w-4xl">
                <div className="mb-3 flex items-center gap-2">
                  <span className={"grid h-7 w-7 place-items-center rounded-lg " + accentTile(recipe.accent)}>
                    <Icon name={recipe.icon} size={14} />
                  </span>
                  <span className="text-[13px] font-semibold tracking-tight text-paper">{recipe.name}</span>
                  <span className="font-mono text-[10.5px] text-fog">v0.1.0 · draft</span>
                </div>
                {recipe.surface === "health-board" ? <HealthBoardSurface metricCols={4} /> : <CicdSurface wide onOperation={() => {}} />}
              </div>
            </div>
            <span className="pointer-events-none absolute bottom-2 right-2 select-none rounded bg-void/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-fog/50">
              mock
            </span>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto py-2 scroll-thin">
            <div className="w-full max-w-[420px]">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-iris-violet/15 text-lavender">
                  <Icon name="sparkles" size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[12.5px] leading-relaxed text-mist">
                    Here’s <span className="font-medium text-paper">{recipe.name}</span> as a card I can drop into chat — same definition as the full page. Want to keep it?
                  </p>
                  <div className="pop-in mt-2 overflow-hidden rounded-xl border border-graphite bg-obsidian/60">
                    <div className="flex items-center gap-2 border-b border-graphite px-3 py-2">
                      <span className={"grid h-5 w-5 place-items-center rounded-md " + accentTile(recipe.accent)}>
                        <Icon name={recipe.icon} size={11} />
                      </span>
                      <span className="truncate text-[11.5px] font-semibold text-mist">{recipe.name}</span>
                      <span className="ml-auto rounded-pill bg-yellow-400/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-yellow-400">
                        mock
                      </span>
                    </div>
                    <div className="max-h-[380px] overflow-y-auto p-2.5 scroll-thin">
                      {recipe.surface === "health-board" ? (
                        <HealthBoardSurface metricCols={2} />
                      ) : (
                        <CicdSurface compact onOperation={() => {}} />
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] text-fog/70">Action buttons arrive after install.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* permission summary rail */}
      <aside className="hidden xl:block">
        <div className="overflow-hidden rounded-xl border border-graphite bg-obsidian/40">
          <button
            type="button"
            onClick={() => setFlowOpen((v) => !v)}
            aria-expanded={flowOpen}
            className="flex w-full items-center gap-2 border-b border-graphite px-3.5 py-2.5 text-left"
          >
            <Icon name="shield" size={13} className="text-fog" />
            <span className="text-[12px] font-semibold tracking-tight text-mist">Permission summary</span>
            <Icon
              name="chevron-down"
              size={13}
              className={"ml-auto text-fog transition-transform " + (flowOpen ? "" : "-rotate-90")}
            />
          </button>
          {flowOpen ? (
            <div className="grid gap-3 px-3.5 py-3">
              <div className="grid gap-1.5">
                {[
                  { from: "surface", to: "data broker", note: "schema-validated calls only" },
                  { from: "broker", to: "permission engine", note: "install grants + run-time risk gate" },
                  { from: "adapter", to: "vault", note: "credentials resolved in main process" },
                ].map((row, i) => (
                  <div key={i} className="rounded-lg border border-graphite/70 px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-mist">
                      {row.from}
                      <Icon name="chevron-right" size={10} className="text-fog/60" />
                      {row.to}
                    </div>
                    <p className="m-0 mt-0.5 text-[10.5px] text-fog/75">{row.note}</p>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fog/70">Requested</div>
                <ul className="m-0 mt-1 grid list-none gap-1 p-0">
                  {recipe.definition.permissions.map((p, i) => (
                    <li key={i} className="flex items-start gap-1.5 font-mono text-[10.5px] leading-relaxed text-fog">
                      <span className="mt-[5px] h-[5px] w-[5px] shrink-0 rounded-full bg-fog/50" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="m-0 border-t border-graphite/70 pt-2.5 text-[10.5px] leading-relaxed text-fog/70">
                Preview reads nothing real. Grants are asked once, at install.
              </p>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Studio — step 4: bind real data
 * ------------------------------------------------------------------------- */

function StudioBind({ recipe, bindings, setBindings, onContinue, onBack }) {
  const allBound = recipe.bindings.every((b) => {
    const v = bindings[b.id];
    if (!v) return false;
    return b.type === "group" ? Boolean(v.group) : Boolean(v.url && v.path);
  });
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-6 py-6 scroll-thin">
      <h2 className="m-0 text-[16px] font-semibold tracking-tight text-paper">Bind real data</h2>
      <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-fog">
        Each source gets its own binding. Credentials never enter the plugin — they stay in the vault and are injected by the connection template.
      </p>

      <div className="mt-4 grid gap-3">
        {recipe.bindings.map((b) => {
          const v = bindings[b.id] ?? {};
          return (
            <div key={b.id} className="rounded-xl border border-graphite bg-obsidian/40 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold tracking-tight text-mist">{b.title}</span>
                <PlKindBadge kind={b.kind} />
                {b.template ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-pill bg-graphite/70 px-2 py-0.5 text-[10.5px] text-fog">
                    <Icon name="key" size={10} />
                    {b.template}
                  </span>
                ) : null}
              </div>
              <p className="m-0 mt-1.5 text-[11.5px] leading-relaxed text-fog/85">{b.hint}</p>

              {b.type === "group" ? (
                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {b.options.map((o) => {
                    const selected = v.group === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setBindings((prev) => ({ ...prev, [b.id]: { group: o.id } }))}
                        className={
                          "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors " +
                          (selected
                            ? "border-acid-lime/60 bg-acid-lime/[0.06]"
                            : "border-graphite hover:border-smoke hover:bg-white/[0.03]")
                        }
                      >
                        <span
                          className={
                            "grid h-4 w-4 shrink-0 place-items-center rounded-full border " +
                            (selected ? "border-acid-lime" : "border-smoke")
                          }
                        >
                          {selected ? <span className="h-2 w-2 rounded-full bg-acid-lime" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-medium text-mist">{o.label}</span>
                          <span className="block text-[11px] text-fog">{o.meta}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2.5 grid gap-2">
                  <div className="flex items-center gap-2 rounded-lg border border-graphite bg-black/30 px-2.5 py-2 transition-colors focus-within:border-smoke">
                    <Icon name="globe" size={13} className="shrink-0 text-fog" />
                    <input
                      value={v.url ?? ""}
                      onChange={(e) => setBindings((prev) => ({ ...prev, [b.id]: { ...v, url: e.target.value } }))}
                      placeholder="https://service.internal.io"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-mist outline-none placeholder:text-fog/50"
                    />
                    <span className="shrink-0 rounded-pill bg-yellow-400/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-yellow-400">
                      user-entered
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-graphite bg-black/30 px-2.5 py-2 transition-colors focus-within:border-smoke">
                    <Icon name="route" size={13} className="shrink-0 text-fog" />
                    <span className="shrink-0 font-mono text-[11px] text-fog/70">path</span>
                    <input
                      value={v.path ?? ""}
                      onChange={(e) => setBindings((prev) => ({ ...prev, [b.id]: { ...v, path: e.target.value } }))}
                      placeholder="/api/v1"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-mist outline-none placeholder:text-fog/50"
                    />
                  </div>
                  <p className="m-0 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-fog/70">
                    <Icon name="lock" size={11} className="mt-[2px] shrink-0" />
                    Requests must match this exact host:port + path prefix — no redirects across endpoints, per http.private policy.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-2.5 py-1.5 text-[12px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!allBound}
          onClick={onContinue}
          className={
            "inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12.5px] font-semibold tracking-tight transition-colors " +
            (allBound ? "bg-acid-lime text-void hover:brightness-105" : "bg-graphite text-fog")
          }
        >
          Run read-only tests
          <Icon name="chevron-right" size={13} />
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Studio — step 5: read-only test
 * ------------------------------------------------------------------------- */

function StudioTest({ recipe, tests, runTest, onContinue, onBack }) {
  const allDone = recipe.tests.every((t) => tests[t.id] === "done");
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-6 py-6 scroll-thin">
      <h2 className="m-0 text-[16px] font-semibold tracking-tight text-paper">Test against real sources</h2>
      <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-fog">
        Only operations marked test-safe run here. Write actions are skipped — they ask for confirmation at run time, every time.
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-graphite bg-obsidian/40">
        {recipe.tests.map((t, i) => {
          const st = tests[t.id] ?? "idle";
          return (
            <div
              key={t.id}
              className={"flex flex-wrap items-center gap-2.5 px-3.5 py-3 " + (i > 0 ? "border-t border-graphite/70" : "")}
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-mist">{t.label}</span>
              {st === "idle" ? (
                <button
                  type="button"
                  onClick={() => runTest(t.id)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-graphite px-2.5 py-1.5 text-[12px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
                >
                  <Icon name="play" size={12} />
                  Run
                </button>
              ) : st === "running" ? (
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-yellow-400">
                  <Icon name="refresh" size={12} className="spin" />
                  running…
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-pulse-green">
                    <Icon name="check" size={11} />
                    {t.rows} rows · {t.latencyMs}ms
                  </span>
                  <span className="font-mono text-[10.5px] text-fog/75">{t.schema}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="m-0 mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-fog/75">
        <Icon name="shield-check" size={12} className="mt-[2px] shrink-0 text-pulse-green/70" />
        Responses are schema-validated and size-capped before they reach the surface. Secrets in headers are stripped from all logs.
      </p>

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-2.5 py-1.5 text-[12px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!allDone}
          onClick={onContinue}
          className={
            "inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12.5px] font-semibold tracking-tight transition-colors " +
            (allDone ? "bg-acid-lime text-void hover:brightness-105" : "bg-graphite text-fog")
          }
        >
          Review grants &amp; install
          <Icon name="chevron-right" size={13} />
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Studio — step 6: install grants
 * ------------------------------------------------------------------------- */

function StudioInstall({ recipe, grants, setGrants, updatePolicy, setUpdatePolicy, onInstall, onBack }) {
  const required = recipe.permissions.map((g) => g.group);
  const allGranted = required.every((k) => grants[k] !== false);
  return (
    <div className="mx-auto grid w-full max-w-3xl flex-1 grid-cols-1 gap-4 overflow-y-auto px-6 py-6 scroll-thin md:grid-cols-[minmax(0,1fr)_260px]">
      <div>
        <h2 className="m-0 text-[16px] font-semibold tracking-tight text-paper">Review grants &amp; install</h2>
        <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-fog">
          Plugins can be revoked anytime. Sensitive actions always ask again at run time — installing never pre-approves them.
        </p>

        <div className="mt-4 grid gap-2.5">
          {recipe.permissions.map((g) => {
            const on = grants[g.group] !== false;
            return (
              <div key={g.group} className="rounded-xl border border-graphite bg-obsidian/40 p-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-semibold tracking-tight text-mist">{g.group}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-[10.5px] text-fog/70">{on ? "granted" : "off"}</span>
                    <PlSwitch
                      on={on}
                      onChange={(v) => setGrants((prev) => ({ ...prev, [g.group]: v }))}
                      ariaLabel={"Grant " + g.group}
                    />
                  </span>
                </div>
                <ul className="m-0 mt-1.5 grid list-none gap-1 p-0">
                  {g.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-fog">
                      <span className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full bg-fog/50" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <div className="rounded-xl border border-graphite bg-obsidian/40 p-3.5">
            <div className="text-[12.5px] font-semibold tracking-tight text-mist">Update policy</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[
                { id: "safe-patches", label: "Safe patches", meta: "auto-update if permissions don’t grow" },
                { id: "manual", label: "Manual", meta: "ask before every update" },
              ].map((o) => {
                const selected = updatePolicy === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setUpdatePolicy(o.id)}
                    className={
                      "rounded-lg border px-3 py-2 text-left transition-colors " +
                      (selected ? "border-acid-lime/60 bg-acid-lime/[0.06]" : "border-graphite hover:border-smoke hover:bg-white/[0.03]")
                    }
                  >
                    <span className="block text-[12px] font-medium text-mist">{o.label}</span>
                    <span className="mt-0.5 block text-[10.5px] leading-relaxed text-fog">{o.meta}</span>
                  </button>
                );
              })}
            </div>
            <p className="m-0 mt-2 text-[10.5px] leading-relaxed text-fog/70">
              Any update that adds permissions, endpoints or components pauses and re-asks — regardless of policy.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md px-2.5 py-1.5 text-[12px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            Back
          </button>
          <button
            type="button"
            disabled={!allGranted}
            onClick={onInstall}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold tracking-tight transition-colors " +
              (allGranted ? "bg-acid-lime text-void hover:brightness-105" : "bg-graphite text-fog")
            }
          >
            <Icon name="puzzle" size={14} />
            Install {recipe.name}
          </button>
        </div>
      </div>

      {/* install summary */}
      <aside>
        <div className="overflow-hidden rounded-xl border border-graphite bg-obsidian/40">
          <div className="flex items-center gap-2.5 border-b border-graphite px-3.5 py-3">
            <span className={"grid h-8 w-8 place-items-center rounded-lg " + accentTile(recipe.accent)}>
              <Icon name={recipe.icon} size={15} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-semibold text-paper">{recipe.name}</div>
              <div className="font-mono text-[10.5px] text-fog">v0.1.0 · draft → local</div>
            </div>
          </div>
          <div className="grid gap-2 px-3.5 py-3 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-fog">Source</span>
              <PlTrustBadge trust="local" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-fog">Data sources</span>
              <span className="font-mono text-mist">{recipe.bindings.length} bound</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-fog">Custom UI</span>
              <span className="font-mono text-mist">none · catalog only</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="shrink-0 text-fog">Appears in</span>
              <span className="text-right text-mist">Plugins · Agent cards</span>
            </div>
          </div>
          <p className="m-0 border-t border-graphite bg-obsidian/40 px-3.5 py-2.5 text-[10.5px] leading-relaxed text-fog/70">
            Secrets stay local. Risky actions stay gated.
          </p>
        </div>
      </aside>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Plugin Studio — orchestrator
 * ------------------------------------------------------------------------- */

function pickRecipe(prompt) {
  const p = prompt.toLowerCase();
  if (/gitlab|jenkins|argocd|ci\/cd|cicd|pipeline|deploy|构建|发布/.test(p)) {
    return STUDIO_RECIPES.find((r) => r.id === "cicd");
  }
  return STUDIO_RECIPES.find((r) => r.id === "health-board");
}

function PluginStudio({ onClose, onInstalled }) {
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [recipe, setRecipe] = useState(null);
  const [stageCount, setStageCount] = useState(0);
  const [genDone, setGenDone] = useState(false);
  const [size, setSize] = useState("page");
  const [bindings, setBindings] = useState(() => {
    const init = {};
    for (const r of STUDIO_RECIPES) {
      for (const b of r.bindings) {
        if (b.type === "endpoint") init[b.id] = { url: b.url, path: b.path };
      }
    }
    return init;
  });
  const [tests, setTests] = useState({});
  const [grants, setGrants] = useState({});
  const [updatePolicy, setUpdatePolicy] = useState("safe-patches");

  const goto = useCallback((i) => {
    setStep(i);
    setMaxStep((m) => Math.max(m, i));
  }, []);

  // stream generation stages when entering step 1
  useEffect(() => {
    if (step !== 1 || !recipe) return;
    setStageCount(0);
    setGenDone(false);
    let i = 0;
    const total = recipe.stages.length;
    const tick = () => {
      i += 1;
      setStageCount(i);
      if (i < total) {
        timer = window.setTimeout(tick, 620 + Math.random() * 260);
      } else {
        timer = window.setTimeout(() => setGenDone(true), 420);
      }
    };
    let timer = window.setTimeout(tick, 420);
    return () => window.clearTimeout(timer);
  }, [step, recipe]);

  // Escape closes studio only from describe step (matches lightweight dismiss)
  const generate = (text) => {
    setPrompt(text);
    setRecipe(pickRecipe(text));
    goto(1);
  };

  const runTest = (id) => {
    setTests((prev) => ({ ...prev, [id]: "running" }));
    window.setTimeout(() => {
      setTests((prev) => ({ ...prev, [id]: "done" }));
    }, 700 + Math.random() * 500);
  };

  const install = () => {
    onInstalled(recipe.id, updatePolicy);
  };

  return (
    <div className="absolute inset-0 z-40 flex bg-void" data-screen-label="Plugin Studio">
      {/* left rail */}
      <aside className="flex w-[210px] shrink-0 flex-col border-r border-graphite bg-carbon px-2.5 pb-4 pt-3">
        <div className="flex h-[30px] items-center gap-2 px-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-acid-lime/12 text-acid-lime">
            <Icon name="sparkles" size={13} />
          </span>
          <span className="text-[13px] font-semibold tracking-tight text-mist">Plugin Studio</span>
        </div>
        <div className="mt-4 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog/70">Steps</div>
        <StudioRail step={step} maxStep={maxStep} onJump={goto} />
        <div className="mt-auto grid gap-1 px-1">
          <p className="m-0 px-1.5 text-[10.5px] leading-relaxed text-fog/60">
            Draft → mock preview → bind → test → install. Real data is only touched after you bind it.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 rounded-md px-2.5 py-2 text-left text-[12px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
          >
            Close studio
          </button>
        </div>
      </aside>

      {/* main */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {recipe && step > 0 ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-graphite px-5 py-2.5">
            <span className={"grid h-6 w-6 place-items-center rounded-md " + accentTile(recipe.accent)}>
              <Icon name={recipe.icon} size={13} />
            </span>
            <span className="text-[13px] font-semibold tracking-tight text-paper">{recipe.name}</span>
            <span className="font-mono text-[10.5px] text-fog">v0.1.0 · draft</span>
            <span className="ml-auto hidden max-w-[280px] truncate font-mono text-[10.5px] text-fog/60 md:inline">
              “{prompt}”
            </span>
            <button
              type="button"
              aria-label="Close studio"
              onClick={onClose}
              className="grid h-7 w-7 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ) : null}

        {step === 0 ? <StudioDescribe onGenerate={generate} /> : null}
        {step === 1 && recipe ? (
          <StudioDraft recipe={recipe} stageCount={stageCount} done={genDone} onContinue={() => goto(2)} />
        ) : null}
        {step === 2 && recipe ? (
          <StudioPreview recipe={recipe} size={size} setSize={setSize} onContinue={() => goto(3)} onBack={() => goto(1)} />
        ) : null}
        {step === 3 && recipe ? (
          <StudioBind
            recipe={recipe}
            bindings={bindings}
            setBindings={setBindings}
            onContinue={() => goto(4)}
            onBack={() => goto(2)}
          />
        ) : null}
        {step === 4 && recipe ? (
          <StudioTest recipe={recipe} tests={tests} runTest={runTest} onContinue={() => goto(5)} onBack={() => goto(3)} />
        ) : null}
        {step === 5 && recipe ? (
          <StudioInstall
            recipe={recipe}
            grants={grants}
            setGrants={setGrants}
            updatePolicy={updatePolicy}
            setUpdatePolicy={setUpdatePolicy}
            onInstall={install}
            onBack={() => goto(4)}
          />
        ) : null}
      </main>
    </div>
  );
}

Object.assign(window, {
  PluginCenterView,
  PluginStudio,
});

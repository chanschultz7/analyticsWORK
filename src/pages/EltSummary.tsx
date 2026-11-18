// ELT Summary ("See"): the condensed executive view of IT performance, built like the RCM analytics
// ELT Summary. Standard BI components only (KPI cards, trend charts, a metric table with conditional
// formatting, a period-by-period table, a multi-metric trend, slicers, drill-through) and no prose:
// actual, target, variance and trend carry the message.
//
// Sections: Key Performance Indicators · Performance Trends · Performance vs. Target (the IT ELT
// framework, as a summary or as a period table) · Selected Metric Trends (the metrics checked in
// Performance vs. Target).

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { fmt, fmtDelta } from '../format';
import { evaluate, M, type Ctx, type MetricValue, type Status } from '../metrics';
import { makePeriod, years, type Period, type PeriodKind } from '../periods';
import { scopeSites, useApp, type PageId } from '../state';
import { Chart } from '../ui/Chart';
import { eltTrendOption, multiTrendOption, SERIES, type TrendLine } from '../ui/charts';
import { fm, InfoIcon, Sparkline, StatusMark } from '../ui/common';
import { Icon } from '../ui/icons';
import { PeriodControls } from '../ui/Shell';
import { downloadCsv } from '../ui/Visual';

/** IT ELT framework: the KPIs leadership reviews, grouped like the RCM framework. Targets: A2 (Convene defaults). */
interface Group { name: string; metrics: string[] }
const FRAMEWORK: Group[] = [
  { name: 'Service Delivery', metrics: ['sla_all', 'fcr', 'asa', 'over7', 'csat'] },
  { name: 'Availability and Resilience', metrics: ['uptime_p1', 'ehr_avail', 'telehealth', 'network', 'unsched_down', 'backup'] },
  { name: 'Risk and Security', metrics: ['mi_p1p2', 'crit7', 'phish', 'vuln_crit', 'phi'] },
  { name: 'Financial', metrics: ['spend_vs_budget', 'cost_ticket', 'cost_user', 'credits', 'downtime_cost'] },
];
const ALL_IDS = FRAMEWORK.flatMap((g) => g.metrics);
/** Headline KPI cards and trend charts. */
const ELT_KPIS = ['uptime_p1', 'sla_all', 'mi_p1p2', 'csat', 'spend_vs_budget'];
const ELT_TRENDS = ['ehr_avail', 'sla_all', 'spend_vs_budget'];
const DEFAULT_CHOSEN = ['sla_all'];
const MAX_UNITS = 2;

const UNIT_LABEL: Record<string, string> = { pct: '%', count: '#', usd: '$', score: 'Score', min: 'Minutes', hrs: 'Hours', sec: 'Seconds', days: 'Days' };
const tone = (s: Status) => s;
/** A 3-month change smaller than this (per unit) shows as flat. */
const FLAT: Record<string, number> = { pct: 0.0005, count: 0, usd: 0.5, score: 0.005, min: 0.5, hrs: 0.05, sec: 0.5, days: 0.05 };

type Grain = 'monthly' | 'quarterly' | 'yearly';
const GRAIN_LABEL: Record<Grain, string> = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
const grainOf = (k: PeriodKind): Grain => (k === 'quarter' ? 'quarterly' : k === 'ytd' || k === 'year' ? 'yearly' : 'monthly');

interface Row { id: string; v: MetricValue; d3: number | null }
function row(id: string, v: MetricValue): Row {
  const t = v.trend;
  const cur = t[t.length - 1]?.value ?? null;
  const prev = t.length >= 4 ? t[t.length - 4].value : null;
  return { id, v, d3: cur !== null && prev !== null ? cur - prev : null };
}

/** Period columns of a time scale, ending with the selected period (12 months, 8 quarters or every year). */
function grainColumns(ds: ReturnType<typeof useApp>['ds'], p: Period, grain: Grain): Period[] {
  if (grain === 'monthly') return Array.from({ length: 12 }, (_, k) => p.endMi - 11 + k).filter((mi) => mi >= 0).map((mi) => makePeriod(ds, 'month', mi));
  if (grain === 'quarterly') {
    const out: Period[] = [];
    for (let k = 7; k >= 0; k--) { const mi = p.endMi - 3 * k; if (mi >= 0) out.push(makePeriod(ds, 'quarter', mi)); }
    return out.filter((q, i) => out.findIndex((x) => x.short === q.short) === i);
  }
  return years(ds).filter((y) => y <= p.year).sort().map((y) => makePeriod(ds, 'year', y === p.year ? p.endMi : ds.months.filter((m) => m.year === y).slice(-1)[0].mi));
}
const colLabel = (c: Period) => (c.kind === 'month' ? c.short : c.kind === 'quarter' ? `${c.short}${c.partial ? ' QTD' : ''}` : `${c.year}${c.partial ? ' YTD' : ''}`);

export function EltSummary() {
  const { ds, ctx, period, go, toast } = useApp();
  const rows = useMemo(() => Object.fromEntries([...new Set([...ALL_IDS, ...ELT_KPIS])].map((id) => [id, row(id, evaluate(ds, id, ctx, 13))])) as Record<string, Row>, [ds, ctx]);
  const open = (id: string) => go(M(id).page as PageId);

  const [view, setView] = useState<'summary' | 'table'>('summary');
  const [grain, setGrain] = useState<Grain>(grainOf(period.kind));
  useEffect(() => setGrain(grainOf(period.kind)), [period.kind]);
  const cols = useMemo(() => grainColumns(ds, period, grain), [ds, period, grain]);
  const grid = useMemo(() => Object.fromEntries(ALL_IDS.map((id) => [id, cols.map((c) => evaluate(ds, id, { ...ctx, mi: c.endMi, mis: c.mis, kind: c.kind } as Ctx, 1))])) as Record<string, MetricValue[]>, [ds, ctx, cols]);

  const [chosen, setChosen] = useState<{ ids: string[]; color: Record<string, string> }>(() => ({ ids: DEFAULT_CHOSEN, color: Object.fromEntries(DEFAULT_CHOSEN.map((id, i) => [id, SERIES[i]])) }));
  const units = [...new Set(chosen.ids.map((id) => M(id).unit))];
  const blocked = (id: string) => {
    if (chosen.ids.includes(id)) return null;
    if (chosen.ids.length >= 8) return 'The chart shows 8 metrics at most. Clear one to add another.';
    if (units.length >= MAX_UNITS && !units.includes(M(id).unit)) return `The chart shows two units at most (${units.map((u) => UNIT_LABEL[u]).join(' and ')}). Clear a metric to add one in ${UNIT_LABEL[M(id).unit]}.`;
    return null;
  };
  const toggle = (id: string) => {
    const why = blocked(id);
    if (why) { toast(why); return; }
    setChosen((c) => {
      if (c.ids.includes(id)) return { ...c, ids: c.ids.filter((x) => x !== id) };
      const used = new Set(c.ids.map((x) => c.color[x]));
      const color = c.color[id] && !used.has(c.color[id]) ? c.color[id] : SERIES.find((s) => !used.has(s)) ?? SERIES[0];
      return { ids: [...c.ids, id], color: { ...c.color, [id]: color } };
    });
  };
  const pick = { chosen, toggle, blocked };

  return (
    <div className="elt">
      <EltHeader />

      <Sec id="elt-kpi" title="Key Performance Indicators" meta={period.label}>
        <div className="elt-kpis">
          {ELT_KPIS.map((id) => <KpiCard key={id} r={rows[id]} onOpen={() => open(id)} />)}
        </div>
      </Sec>

      <Sec id="elt-trend" title="Performance Trends" meta={`12 months ending ${ds.months[period.endMi].short}`}>
        <div className="elt-trends">
          {ELT_TRENDS.map((id) => <TrendCard key={id} r={rows[id]} onOpen={() => open(id)} />)}
        </div>
      </Sec>

      <div className="elt-split">
        <Sec id="elt-target" title="Performance vs. Target" meta={view === 'summary' ? period.label : `${GRAIN_LABEL[grain]} · ${spanText(cols)}`}
          actions={(
            <>
              <span className="seg seg-xs" role="radiogroup" aria-label="Performance vs. Target view">
                <button type="button" role="radio" aria-checked={view === 'summary'} className={view === 'summary' ? 'on' : ''} onClick={() => setView('summary')}>Summary</button>
                <button type="button" role="radio" aria-checked={view === 'table'} className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
              </span>
              {view === 'table' && <><GrainSelect grain={grain} setGrain={setGrain} /><ExportButton cols={cols} grid={grid} grain={grain} /></>}
            </>
          )}>
          {view === 'summary' ? <TargetTable rows={rows} onOpen={open} pick={pick} /> : <PeriodTable cols={cols} grid={grid} onOpen={open} pick={pick} />}
        </Sec>
        <Sec id="elt-selected" title="Selected Metric Trends" meta={`${GRAIN_LABEL[grain]} · ${spanText(cols)}`} actions={<GrainSelect grain={grain} setGrain={setGrain} />}>
          <SelectedTrend chosen={chosen} cols={cols} grid={grid} grain={grain} />
        </Sec>
      </div>
    </div>
  );
}

function spanText(cols: Period[]) {
  if (!cols.length) return 'No periods in the data window';
  return cols.length === 1 ? cols[0].label : `${colLabel(cols[0])} to ${colLabel(cols[cols.length - 1])}`;
}

function GrainSelect({ grain, setGrain }: { grain: Grain; setGrain: (g: Grain) => void }) {
  return (
    <select className="sel-xs" value={grain} onChange={(e) => setGrain(e.target.value as Grain)} aria-label="Time scale">
      {(Object.keys(GRAIN_LABEL) as Grain[]).map((g) => <option key={g} value={g}>{GRAIN_LABEL[g]}</option>)}
    </select>
  );
}

// ---------------------------------------------------------------- header and slicers

function EltHeader() {
  const { ds, route, period } = useApp();
  const sc = scopeSites(ds, route);
  const scope = !sc.length ? `All sites (${ds.sites.length})` : sc[0] === -1 ? 'No sites match' : sc.length === 1 ? ds.sites[sc[0]].name : route.region.length === 1 && !route.sites.length ? `${ds.regions[route.region[0]]} (${sc.length} sites)` : `${sc.length} sites`;
  return (
    <header className="elt-head">
      <div className="elt-title">
        <h1>ELT Summary</h1>
        <p>IT Operations Performance · {ds.client} · {scope} · {period.label}{period.partial && <span className="pill pill-prelim">To date</span>}</p>
      </div>
      <EltSlicers />
    </header>
  );
}

function EltSlicers() {
  const { ds, route, set, toast } = useApp();
  const scope = route.sites.length === 1 && !route.region.length ? `s${route.sites[0]}` : route.region.length === 1 && !route.sites.length ? `r${route.region[0]}` : route.sites.length || route.region.length || route.ft.length ? 'custom' : 'all';
  const setScope = (v: string) => set({ region: v.startsWith('r') ? [Number(v.slice(1))] : [], ft: [], sites: v.startsWith('s') ? [Number(v.slice(1))] : [] });
  const otherCount = route.pt.length + route.sl.length + route.pri.length + route.cat.length + route.areas.length;
  return (
    <div className="elt-slicers no-print">
      {otherCount > 0 && (
        <span className="elt-other" title="Filters set on other pages also apply here">
          Filtered ({otherCount})
          <button type="button" className="icon-btn xs" aria-label="Clear additional filters" onClick={() => set({ pt: [], sl: [], pri: [], cat: [], areas: [] })}><Icon name="close" size={9} /></button>
        </span>
      )}
      <PeriodControls layout="row" />
      <label className="elt-slicer"><span>Site</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">All sites</option>
          {scope === 'custom' && <option value="custom">Multiple selected</option>}
          <optgroup label="Region">{ds.regions.map((r, i) => <option key={r} value={`r${i}`}>{r}</option>)}</optgroup>
          <optgroup label="Site">{ds.sites.map((f) => <option key={f.key} value={`s${f.key}`}>{f.short}</option>)}</optgroup>
        </select>
      </label>
      <span className="elt-actions">
        <button type="button" className="icon-btn" title="Copy link" onClick={() => { try { void navigator.clipboard?.writeText(location.href); } catch { /* blocked */ } toast('Link copied.'); }}><Icon name="share" /></button>
        <button type="button" className="icon-btn" title="Export to PDF" onClick={() => window.print()}><Icon name="download" /></button>
      </span>
    </div>
  );
}

function Sec({ id, title, meta, actions, children }: { id: string; title: string; meta?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="elt-sec" aria-labelledby={id}>
      <div className="elt-sec-head">
        <h2 id={id}>{title}</h2>
        {meta && <span className="elt-meta">{meta}</span>}
        {actions && <span className="elt-sec-actions no-print">{actions}</span>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- shared cells

const label = (id: string) => <><span className="elt-code">{M(id).code}</span>{M(id).name}</>;
const shortLabel = (id: string) => <><span className="elt-code">{M(id).code}</span>{M(id).short ?? M(id).name}</>;

function Change3({ r }: { r: Row }) {
  const m = r.v.m;
  if (r.d3 === null) return <span className="muted">–</span>;
  const flat = Math.abs(r.d3) <= (FLAT[m.unit] ?? 0);
  const fav = flat || m.better === 'none' ? '' : (m.better === 'up') === r.d3 > 0 ? 'fav' : 'unfav';
  return <span className={`elt-chg ${fav}`}><span aria-hidden="true">{flat ? '▶' : r.d3 > 0 ? '▲' : '▼'}</span> {fmtDelta(r.d3, m.unit, m.digits)}</span>;
}
const Target = ({ id, target }: { id: string; target: number | null }) => (target === null ? <span className="muted">No target set</span> : <>{fm(id)(target)}</>);
function Variance({ r }: { r: Row }) {
  if (r.v.target === null || r.v.variance === null) return <span className="muted">–</span>;
  return <span className={`elt-var v-${tone(r.v.status)}`}>{fmtDelta(r.v.variance, r.v.m.unit, r.v.m.digits)}</span>;
}

// ---------------------------------------------------------------- KPI cards and trend cards

function KpiCard({ r, onOpen }: { r: Row; onOpen: () => void }) {
  const v = r.v;
  return (
    <div className={`elt-kpi st-${tone(v.status)}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') onOpen(); }} title={`Analyze ${v.m.name}`}>
      <div className="elt-kpi-name"><span>{shortLabel(r.id)}</span><InfoIcon id={r.id} /></div>
      <div className="elt-kpi-mid">
        <span className="elt-kpi-value">{fm(r.id)(v.value)}</span>
        <Sparkline values={v.trend.slice(-12).map((t) => t.value)} target={v.trend[v.trend.length - 1]?.target ?? null} status={v.trend.slice(-12).map((t) => t.status)} width={88} height={30} />
      </div>
      <dl className="elt-kpi-grid">
        <div><dt>Target</dt><dd><Target id={r.id} target={v.target} /></dd></div>
        <div><dt>Variance to target</dt><dd><Variance r={r} /></dd></div>
        <div><dt>3M change</dt><dd><Change3 r={r} /></dd></div>
      </dl>
    </div>
  );
}

function TrendCard({ r, onOpen }: { r: Row; onOpen: () => void }) {
  const { ds } = useApp();
  const m = r.v.m;
  const t = r.v.trend.slice(-12);
  const f = (x: number) => fmt(x, m.unit, m.digits);
  const target = t[t.length - 1]?.target ?? null;
  const option = useMemo(() => eltTrendOption({ labels: t.map((x) => ds.months[x.mi].short), values: t.map((x) => x.value), target, fmt: f, direction: m.better, bars: m.unit === 'count' }), [r]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="elt-trend">
      <div className="elt-trend-head">
        <span className="elt-trend-name">{shortLabel(r.id)}</span>
        <span className="elt-trend-kv"><span>Actual <b>{fm(r.id)(t[t.length - 1]?.value)}</b></span><span>Target <b>{fm(r.id)(target)}</b></span></span>
      </div>
      <Chart height={150} ariaLabel={`${m.name}, monthly, 12 months`} option={option} onClick={onOpen} />
      <div className="elt-legend" aria-hidden="true"><i className="lg-line" />Actual<i className="lg-target" />Target<i className="lg-zone" />Off-target range</div>
    </div>
  );
}

// ---------------------------------------------------------------- performance vs. target

interface Pick { chosen: { ids: string[]; color: Record<string, string> }; toggle: (id: string) => void; blocked: (id: string) => string | null }

function MetricCheck({ id, pick }: { id: string; pick: Pick }) {
  const on = pick.chosen.ids.includes(id);
  const why = pick.blocked(id);
  return (
    <span className="elt-check" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={on} onChange={() => pick.toggle(id)} aria-label={`Show ${M(id).name} on the trend chart`} title={why ?? (on ? 'Hide from the trend chart' : 'Show on the trend chart')}
        style={on ? { accentColor: pick.chosen.color[id] } : undefined} />
    </span>
  );
}

function TargetTable({ rows, onOpen, pick }: { rows: Record<string, Row>; onOpen: (id: string) => void; pick: Pick }) {
  return (
    <div className="elt-table">
      <table>
        <thead>
          <tr>
            <th className="al-left">Metric</th><th>Actual</th><th>Target</th><th>Variance to target</th>
            <th className="al-center">Status</th><th>3M change</th><th className="al-center">12-month trend</th><th>Months met (12)</th>
          </tr>
        </thead>
        <tbody>
          {FRAMEWORK.map((g) => [
            <tr key={g.name} className="elt-group"><td colSpan={8}>{g.name}</td></tr>,
            ...g.metrics.map((id) => {
              const r = rows[id];
              return (
                <tr key={id} className={`clickable ${pick.chosen.ids.includes(id) ? 'elt-row-on' : ''}`} tabIndex={0} onClick={() => onOpen(id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(id); }} title={`Analyze ${M(id).name}`}>
                  <td className="al-left elt-mname"><MetricCheck id={id} pick={pick} />{label(id)}<InfoIcon id={id} /></td>
                  <td><b>{fm(id)(r.v.value)}</b></td>
                  <td className="muted"><Target id={id} target={r.v.target} /></td>
                  <td><Variance r={r} /></td>
                  <td className="al-center"><StatusMark status={r.v.status} compact /></td>
                  <td><Change3 r={r} /></td>
                  <td className="al-center"><Sparkline values={r.v.trend.slice(-12).map((t) => t.value)} target={r.v.trend[r.v.trend.length - 1]?.target ?? null} width={72} height={20} /></td>
                  <td className="muted">{r.v.monthsMeasured ? `${r.v.monthsMet} of ${r.v.monthsMeasured}` : 'n/a'}</td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
    </div>
  );
}

function PeriodTable({ cols, grid, onOpen, pick }: { cols: Period[]; grid: Record<string, MetricValue[]>; onOpen: (id: string) => void; pick: Pick }) {
  if (!cols.length) return <div className="elt-table elt-none">No periods of this time scale in the data window.</div>;
  return (
    <div className="elt-table elt-ptable">
      <table>
        <thead>
          <tr><th className="al-left elt-sticky">Metric</th><th>Target</th>{cols.map((c) => <th key={c.label} title={c.label}>{colLabel(c)}</th>)}</tr>
        </thead>
        <tbody>
          {FRAMEWORK.map((g) => [
            <tr key={g.name} className="elt-group"><td className="elt-sticky">{g.name}</td><td colSpan={cols.length + 1} /></tr>,
            ...g.metrics.map((id) => (
              <tr key={id} className={`clickable ${pick.chosen.ids.includes(id) ? 'elt-row-on' : ''}`} tabIndex={0} onClick={() => onOpen(id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(id); }} title={`Analyze ${M(id).name}`}>
                <td className="al-left elt-mname elt-sticky"><MetricCheck id={id} pick={pick} />{label(id)}</td>
                <td className="muted"><Target id={id} target={grid[id][grid[id].length - 1]?.target ?? null} /></td>
                {grid[id].map((r, i) => <td key={cols[i].label}><span className={`cell-status st-${r.status}`}>{fm(id)(r.value)}</span></td>)}
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

function ExportButton({ cols, grid, grain }: { cols: Period[]; grid: Record<string, MetricValue[]>; grain: Grain }) {
  const { toast } = useApp();
  const run = () => {
    const columns = ['Group', 'Code', 'Metric', 'Unit', 'Target', ...cols.map(colLabel)];
    const rows = FRAMEWORK.flatMap((g) => g.metrics.map((id) => [g.name, M(id).code, M(id).name, UNIT_LABEL[M(id).unit], fm(id)(grid[id][grid[id].length - 1]?.target ?? null), ...grid[id].map((r) => fm(id)(r.value))]));
    downloadCsv(`ELT Performance vs Target ${GRAIN_LABEL[grain]}`, { columns, rows });
    toast(`Exported "Performance vs. Target" (${rows.length} metrics × ${cols.length} periods).`);
  };
  return <button type="button" className="btn btn-sm" onClick={run} title="Download the table as a CSV file that opens in Excel"><Icon name="download" size={12} /> Export</button>;
}

// ---------------------------------------------------------------- selected metric trends

function SelectedTrend({ chosen, cols, grid, grain }: { chosen: Pick['chosen']; cols: Period[]; grid: Record<string, MetricValue[]>; grain: Grain }) {
  const [showTargets, setShowTargets] = useState(true);
  const units = [...new Set(chosen.ids.map((id) => M(id).unit))];
  const lines: TrendLine[] = chosen.ids.map((id) => ({
    name: M(id).short ?? M(id).name, color: chosen.color[id], axis: units.indexOf(M(id).unit) as 0 | 1,
    data: grid[id].map((r) => r.value), target: grid[id].map((r) => r.target),
  }));
  const axes = units.map((u) => ({ name: UNIT_LABEL[u], fmt: (v: number) => fmt(v, u, u === 'pct' ? 1 : undefined) }));
  const option = useMemo(() => multiTrendOption({ labels: cols.map(colLabel), lines, axes, showTargets }), [cols, chosen, grid, showTargets]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="elt-trend elt-multi">
      <div className="elt-trend-head">
        <span className="elt-trend-kv">{units.length === 2 ? <span>Left axis <b>{UNIT_LABEL[units[0]]}</b> · right axis <b>{UNIT_LABEL[units[1]]}</b></span> : null}</span>
        <label className="elt-trend-kv no-print"><input type="checkbox" checked={showTargets} onChange={(e) => setShowTargets(e.target.checked)} /> Targets</label>
      </div>
      {chosen.ids.length === 0 || !cols.length
        ? <div className="elt-none">{!cols.length ? 'No periods of this time scale in the data window.' : 'Check one or more metrics in Performance vs. Target to show their trend.'}</div>
        : <Chart height={300} ariaLabel={`${chosen.ids.map((id) => M(id).name).join(', ')}: ${GRAIN_LABEL[grain].toLowerCase()} trend`} option={option} />}
      <div className="elt-note muted">Solid line = actual · dashed line = target · check metrics in Performance vs. Target (two units at most)</div>
    </div>
  );
}


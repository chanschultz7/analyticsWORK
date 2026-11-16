// Quarter and Year Review (CEO / board view): every KPI by quarter and by month for the selected
// year, with the year to date, the same months last year and the status against target.

import { useMemo, useState } from 'react';
import { fmtDelta, num } from '../format';
import { AREAS, evaluate, M, SCORECARD_IDS, targetText, type Area, type Ctx, type MetricValue } from '../metrics';
import { makePeriod, miOf, quartersOf } from '../periods';
import { useApp } from '../state';
import { Chart } from '../ui/Chart';
import { barOption, COMPARE, SERIES } from '../ui/charts';
import { fm, InfoIcon, StatusMark, TrendTag } from '../ui/common';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';

/** Headline KPIs for leadership: one or two per area. */
const HEADLINE = ['svc_levels_met', 'uptime_p1', 'ehr_avail', 'mi_p1p2', 'mi_downtime', 'sla_all', 'tickets_resolved', 'csat', 'fcr', 'over7',
  'network', 'unsched_down', 'backup', 'crit7', 'phish', 'vuln_crit', 'phi', 'chg_success', 'spend_vs_budget', 'it_spend', 'cost_ticket', 'credits', 'downtime_cost'];

export function Review() {
  const { ds, ctx, period, go } = useApp();
  const [headline, setHeadline] = useState(true);
  const [area, setArea] = useState<Area | 'All'>('All');
  const year = period.year;
  const base: Ctx = { ...ctx, sites: ctx.sites, pri: [], cat: [] };
  const quarters = quartersOf(ds, year).map((q) => makePeriod(ds, 'quarter', q.mi + 2 > ds.currentMi ? ds.currentMi : q.mi + 2));
  const ytdEnd = ds.months.filter((m) => m.year === year && m.mi <= ds.currentMi).slice(-1)[0].mi;
  const yearP = makePeriod(ds, 'year', ytdEnd);
  const monthMis = Array.from({ length: 12 }, (_, k) => miOf(ds, year, k));
  const pctx = (p: { mis: number[]; endMi: number; kind: Ctx['kind'] }): Ctx => ({ ...base, mi: p.endMi, mis: p.mis, kind: p.kind });
  const { route } = useApp();
  const ids = (headline ? HEADLINE : SCORECARD_IDS).filter((id) => (area === 'All' || M(id).area === area) && (!route.areas.length || route.areas.includes(M(id).area)));

  const rows = useMemo(() => ids.map((id) => ({
    id, year: evaluate(ds, id, pctx(yearP), 1),
    q: quarters.map((q) => evaluate(ds, id, pctx(q), 1)),
    m: monthMis.map((mi) => (mi >= 0 && mi <= ds.currentMi ? evaluate(ds, id, pctx({ mis: [mi], endMi: mi, kind: 'month' }), 1) : null)),
  })), [ids.join(), year, ctx.sites.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = (vals: (MetricValue | null)[]) => ({ ok: vals.filter((v) => v?.status === 'ok').length, watch: vals.filter((v) => v?.status === 'watch').length, off: vals.filter((v) => v?.status === 'off').length });
  const qCounts = quarters.map((_, i) => counts(rows.map((r) => r.q[i])));
  const exportQ = { columns: ['KPI', 'Target', ...quarters.map((q) => q.short), yearP.short, 'Prior year', 'Change'], rows: rows.map((r) => { const f = fm(r.id); return [M(r.id).name, targetText(ds, M(r.id), pctx(yearP), f), ...r.q.map((v) => f(v.value)), f(r.year.value), f(r.year.py), fmtDelta(r.year.pyChange, M(r.id).unit, M(r.id).digits)]; }) };
  const exportM = { columns: ['KPI', ...monthMis.map((_, k) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][k])], rows: rows.map((r) => [M(r.id).name, ...r.m.map((v) => (v ? fm(r.id)(v.value) : ''))]) };

  // Quarterly charts
  const qLabels = quarters.map((q) => q.short);
  const qpy = (id: string) => quarters.map((q) => evaluate(ds, id, pctx(q), 1).py);
  const qv = (id: string) => quarters.map((q) => evaluate(ds, id, pctx(q), 1).value);

  return (
    <div className="page">
      <CanvasHeader title={`Quarter and Year Review: ${year}`} right={(
        <div className="score-summary">
          {quarters.map((q, i) => <span key={q.short} title={`${q.label}: green / amber / red`}>{q.short}: <span className="txt-ok">{qCounts[i].ok}</span> / <span className="txt-watch">{qCounts[i].watch}</span> / <span className="txt-off">{qCounts[i].off}</span></span>)}
        </div>
      )} />
      <div className="row cols-4">
        <QChart title="Service levels met by quarter" id="svc_levels_met" labels={qLabels} cur={qv('svc_levels_met')} py={qpy('svc_levels_met')} />
        <QChart title="P1 + P2 incidents by quarter" id="mi_p1p2" labels={qLabels} cur={qv('mi_p1p2')} py={qpy('mi_p1p2')} />
        <QChart title="Tickets resolved by quarter" id="tickets_resolved" labels={qLabels} cur={qv('tickets_resolved')} py={qpy('tickets_resolved')} />
        <QChart title="Managed IT spend by quarter" id="it_spend" labels={qLabels} cur={qv('it_spend')} py={qpy('it_spend')} />
      </div>

      <Visual title={`Quarterly scorecard, ${year}`} subtitle={`Each quarter against its target (per-month targets scale to 3 months) · ${yearP.label} vs the same months of ${year - 1} · click a row to open its page`}
        table={exportQ}
        actions={(
          <span className="toggles">
            <span className="seg seg-xs" role="radiogroup" aria-label="Area">
              {(['All', ...AREAS] as const).map((a) => <button key={a} type="button" role="radio" aria-checked={area === a} className={area === a ? 'on' : ''} onClick={() => setArea(a)}>{a}</button>)}
            </span>
            <label><input type="checkbox" checked={headline} onChange={(e) => setHeadline(e.target.checked)} /> Headline KPIs only ({HEADLINE.length})</label>
          </span>
        )}>
        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th className="al-left sticky-col">KPI</th><th className="al-left">Target</th>
                {quarters.map((q) => <th key={q.short}>{q.short}{q.partial ? '*' : ''}</th>)}
                <th>{yearP.partial ? `YTD ${year}` : `FY ${year}`}</th><th>Same months {year - 1}</th><th>Change</th><th className="al-center">vs PY</th><th className="al-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = M(r.id);
                const f = fm(r.id);
                return (
                  <tr key={r.id} className="clickable" onClick={() => go(m.page as never)}>
                    <td className="al-left sticky-col"><span className="metric-cell">{m.short ?? m.name}<InfoIcon id={r.id} /></span></td>
                    <td className="al-left muted">{targetText(ds, m, pctx(yearP), f)}</td>
                    {r.q.map((v, i) => <td key={i}><span className={`cell-status st-${v.status}`}>{f(v.value)}</span></td>)}
                    <td><b className={`cell-status st-${r.year.status}`}>{f(r.year.value)}</b></td>
                    <td className="muted">{f(r.year.py)}</td>
                    <td>{fmtDelta(r.year.pyChange, m.unit, m.digits)}</td>
                    <td className="al-center"><TrendTag t={r.year.m3} /></td>
                    <td className="al-center"><StatusMark status={r.year.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="footnote">* Quarter to date. Counts and hours (tickets, incidents, downtime, spend) are totals for the period; rates are weighted over the period; coverage and backlog are month-end values; capacity is the peak.</p>
      </Visual>

      <Visual title={`Month by month, ${year}`} subtitle="Each cell colored by its monthly status · read across to see when a measure slipped and recovered" table={exportM}>
        <div className="grid-wrap">
          <table className="grid heat">
            <thead><tr><th className="al-left sticky-col">KPI</th>{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((mn) => <th key={mn}>{mn}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="al-left sticky-col">{M(r.id).short ?? M(r.id).name}</td>
                  {r.m.map((v, k) => <td key={k} className={v ? `heat-${v.status}` : 'heat-empty'}>{v ? fm(r.id)(v.value) : ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">Months met target in {year}: {num(rows.reduce((a, r) => a + r.m.filter((v) => v?.status === 'ok').length, 0))} of {num(rows.reduce((a, r) => a + r.m.filter((v) => v && v.status !== 'none').length, 0))} KPI-months with a target.</p>
      </Visual>
    </div>
  );
}

function QChart({ title, id, labels, cur, py }: { title: string; id: string; labels: string[]; cur: (number | null)[]; py: (number | null)[] }) {
  const f = fm(id);
  return (
    <Visual title={title} metricId={id} subtitle="This year vs same quarter last year" table={{ columns: ['Quarter', 'This year', 'Last year'], rows: labels.map((l, i) => [l, f(cur[i]), f(py[i])]) }}>
      <Chart height={180} ariaLabel={title} option={barOption({ labels, fmt: f, series: [{ name: 'Last year', data: py, color: COMPARE }, { name: 'This year', data: cur, color: SERIES[0] }], labelsOn: true })} />
    </Visual>
  );
}

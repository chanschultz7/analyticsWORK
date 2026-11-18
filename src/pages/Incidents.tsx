// Major Incidents (MOR slide 10) and the full major incident log (A5).

import { useState } from 'react';
import type { Incident } from '../data/model';
import { num } from '../format';
import { useApp } from '../state';
import { Chart } from '../ui/Chart';
import { barOption, PRI_COLORS, stackedOption } from '../ui/charts';
import { Band, Commentary, KpiCard, RagCell } from '../ui/common';
import { Grid, gridExport, type Col } from '../ui/Grid';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';

type Scope = 'month' | 'open' | '12';

export function Incidents() {
  const { ds, ctx, set, route, toggle, period, cmpPeriod } = useApp();
  const [scope, setScope] = useState<Scope>('month');
  const [openId, setOpenId] = useState<string | null>(null);
  const mi = ctx.mi;
  const siteOk = (i: Incident) => !ctx.sites.length || i.sites.some((s) => ctx.sites.includes(s));
  const month = ds.incidents.filter((i) => ctx.mis.includes(i.mi) && siteOk(i));
  const prior = ds.incidents.filter((i) => cmpPeriod.mis.includes(i.mi) && siteOk(i));
  const actions = ds.incidents.filter((i) => i.mi <= mi && siteOk(i));
  const open = actions.filter((i) => i.actionStatus !== 'Closed');
  const overdue = open.filter((i) => i.actionStatus === 'Overdue');
  const closedNow = month.filter((i) => i.actionStatus === 'Closed').length;
  const downtime = month.reduce((a, i) => a + i.clinicalDowntimeHrs, 0);
  const sitesHit = new Set(month.filter((i) => i.clinicalDowntimeHrs > 0).flatMap((i) => i.sites)).size;
  const longest = [...month].sort((a, b) => b.durationHrs - a.durationHrs)[0];
  const within = month.filter((i) => i.withinSla).length;
  const avgResp = month.length ? month.reduce((a, i) => a + i.responseMin, 0) / month.length : null;
  const list = scope === 'month' ? month : scope === 'open' ? ds.incidents.filter((i) => i.mi <= mi && siteOk(i) && (ctx.mis.includes(i.mi) || i.actionStatus !== 'Closed')) : ds.incidents.filter((i) => i.mi <= mi && i.mi > mi - 12 && siteOk(i));
  const months = ds.months.filter((m) => m.mi <= mi && m.mi > mi - 13);
  const bySys = Object.entries(ds.incidents.filter((i) => i.mi <= mi && i.mi > mi - 12 && siteOk(i)).reduce<Record<string, number>>((a, i) => { a[i.system] = (a[i.system] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const bySite = ds.sites.map((s) => ({ s, n: ds.incidents.filter((i) => i.mi <= mi && i.mi > mi - 12 && i.sites.includes(s.key)).length }));

  const cols: Col<Incident>[] = [
    { key: 'id', label: 'ID', width: 110, value: (r) => r.id, render: (r) => <span className="inc-id"><button type="button" className="tree-btn" aria-label="Show details">{openId === r.id ? '▾' : '▸'}</button>{r.id}</span> },
    { key: 'opened', label: 'Opened', align: 'left', value: (r) => r.mi * 100 + r.day, render: (r) => r.opened, exportText: (r) => r.opened },
    { key: 'system', label: 'System and sites affected', align: 'left', wrap: true, value: (r) => r.system, render: (r) => <span>{r.system}; <span className="muted">{r.sites.length === ds.sites.length ? 'all sites' : r.sites.map((s) => ds.sites[s].short).join(', ')}</span></span>, exportText: (r) => `${r.system}; ${r.sites.map((s) => ds.sites[s].short).join(', ')}` },
    { key: 'sev', label: 'Sev.', align: 'center', value: (r) => r.sev, render: (r) => <span className={`sev sev-${r.sev}`}>{r.sev}</span> },
    { key: 'dur', label: 'Duration', value: (r) => r.durationHrs, render: (r) => `${r.durationHrs.toFixed(1)} hrs` },
    { key: 'sla', label: 'Within SLA', align: 'center', value: (r) => (r.withinSla ? 1 : 0), render: (r) => (r.withinSla ? <span className="txt-ok">Yes</span> : <span className="txt-off">No</span>), exportText: (r) => (r.withinSla ? 'Yes' : 'No') },
    { key: 'impact', label: 'Clinical or business impact', align: 'left', wrap: true, value: (r) => r.impact, sortable: false },
    { key: 'rc', label: 'Root cause (status)', align: 'left', wrap: true, value: (r) => r.rootCause, render: (r) => <span>{r.rootCause}; <span className={r.rcStatus === 'Confirmed' ? 'txt-ok' : 'txt-watch'}>{r.rcStatus}</span></span>, exportText: (r) => `${r.rootCause}; ${r.rcStatus}` },
    { key: 'action', label: 'Preventive action', align: 'left', wrap: true, value: (r) => r.action, render: (r) => <span>{r.action}<br /><span className="muted">{r.owner} · due {r.due}</span></span>, exportText: (r) => `${r.action}; ${r.owner}; ${r.due}` },
    { key: 'ast', label: 'Action', align: 'left', value: (r) => r.actionStatus, render: (r) => <RagCell rag={r.actionStatus === 'Closed' ? 'G' : r.actionStatus === 'Overdue' ? 'R' : 'A'} text={r.actionStatus} /> },
  ];
  const g = list.map((i) => ({ id: i.id, data: i }));
  const detail = openId ? ds.incidents.find((i) => i.id === openId) : null;

  return (
    <div className="page">
      <CanvasHeader />
      <Band type="kpi" note="How many major incidents, how much clinical impact, and are fixes on track? (MOR slide 10)" />
      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <KpiCard id="mi_p1p2" label="Count · P1 and P2 incidents" sub={<span className="muted">{month.filter((i) => i.sev === 'P1').length} P1 · {month.filter((i) => i.sev === 'P2').length} P2 · {cmpPeriod.short} {prior.filter((i) => i.sev === 'P1').length} P1 · {prior.filter((i) => i.sev === 'P2').length} P2</span>} />
        <KpiCard id="mi_downtime" label="Impact · clinical downtime" sub={<span className="muted ellipsis">{sitesHit} sites · longest: {longest ? `${longest.system}, ${longest.durationHrs.toFixed(1)} hrs` : '–'}</span>} />
        <KpiCard id="mi_p1" label="P1 incidents" sub={<span className="muted">Response within SLA: <b>{within} of {month.length}</b> · avg {avgResp === null ? '–' : `${Math.round(avgResp)} min`}</span>} />
        <div className={`kpi static st-${overdue.length ? 'off' : open.length ? 'watch' : 'ok'}`}>
          <div className="kpi-top"><span className="kpi-name">Prevention · corrective actions</span></div>
          <div className="kpi-mid"><span className="kpi-value">{open.length} open · <span className={overdue.length ? 'txt-off' : ''}>{overdue.length} overdue</span></span></div>
          <div className="kpi-row"><span className="muted">{closedNow} closed in period · {downtime.toFixed(1)} hrs clinical downtime</span></div>
        </div>
      </div>

      <Band type="trend" />
      <div className="row cols-2">
        <Visual title="P1 and P2 incidents, monthly" metricId="mi_p1p2" subtitle="Target ≤ 2 per month · click a column to set the month"
          table={{ columns: ['Month', 'P1', 'P2'], rows: months.map((m) => [m.label, ds.incidents.filter((i) => i.mi === m.mi && i.sev === 'P1' && siteOk(i)).length, ds.incidents.filter((i) => i.mi === m.mi && i.sev === 'P2' && siteOk(i)).length]) }}>
          <Chart height={220} ariaLabel="Incidents by month" onClick={(i) => months[i] && set({ mi: months[i].mi, pk: 'month' })}
            option={stackedOption({ labels: months.map((m) => m.short), fmt: (v) => num(v), series: (['P1', 'P2'] as const).map((p) => ({ name: p, color: PRI_COLORS[p], data: months.map((m) => ds.incidents.filter((i) => i.mi === m.mi && i.sev === p && siteOk(i)).length) })) })} />
        </Visual>
        <Visual title="Clinical downtime from major incidents, monthly" metricId="mi_downtime" subtitle="Hours on downtime procedures · click a column to set the month"
          table={{ columns: ['Month', 'Clinical downtime (hrs)'], rows: months.map((m) => [m.label, ds.incidents.filter((i) => i.mi === m.mi && siteOk(i)).reduce((a, i) => a + i.clinicalDowntimeHrs, 0)]) }}>
          <Chart height={220} ariaLabel="Clinical downtime by month" onClick={(i) => months[i] && set({ mi: months[i].mi, pk: 'month' })}
            option={barOption({ labels: months.map((m) => m.short), fmt: (v) => `${v.toFixed(1)} h`, series: [{ name: 'Clinical downtime', data: months.map((m) => Math.round(ds.incidents.filter((i) => i.mi === m.mi && siteOk(i)).reduce((a, i) => a + i.clinicalDowntimeHrs, 0) * 10) / 10), color: '#bb3328' }] })} />
        </Visual>
      </div>

      <Band type="where" note="Which systems and sites had major incidents (last 12 months)?" />
      <div className="row cols-2">
        <Visual title="Incidents by system, last 12 months" subtitle="P1 + P2 count" table={{ columns: ['System', 'Incidents'], rows: bySys }}>
          <Chart height={220} ariaLabel="Incidents by system" option={barOption({ labels: bySys.map((x) => x[0]), horizontal: true, fmt: (v) => num(v), series: [{ name: 'Incidents', data: bySys.map((x) => x[1]) }] })} />
        </Visual>
        <Visual title="Incidents by site affected, last 12 months" subtitle="An incident can affect several sites · click a bar to filter" table={{ columns: ['Site', 'Incidents'], rows: bySite.map((x) => [x.s.short, x.n]) }}>
          <Chart height={220} ariaLabel="Incidents by site" onClick={(i) => toggle('sites', bySite[i].s.key)}
            option={barOption({ labels: bySite.map((x) => x.s.short), horizontal: true, fmt: (v) => num(v), selected: bySite.map((x, i) => (route.sites.includes(x.s.key) ? i : -1)).filter((i) => i >= 0), series: [{ name: 'Incidents', data: bySite.map((x) => x.n) }] })} />
        </Visual>
      </div>

      <Band type="why" note="Root cause and resolution of each incident (A5 log) · click a row for the full record" />
      <Visual title={scope === 'month' ? `P1 and P2 incidents and problem records, ${period.label}` : scope === 'open' ? 'Major incident log (A5): this period plus open actions' : 'Major incident log, last 12 months'}
        subtitle="Click a row for the full record" table={gridExport(cols, g)}
        actions={(
          <span className="seg seg-xs" role="radiogroup" aria-label="Scope">
            {([['month', 'This period'], ['open', 'With open actions (A5)'], ['12', 'Last 12 months']] as [Scope, string][]).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={scope === k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{l}</button>)}
          </span>
        )}>
        <Grid caption="Incident log" columns={cols} rows={g} defaultSort={{ key: 'opened', dir: 'desc' }} selected={(r) => r.id === openId} onRowClick={(r) => setOpenId(openId === r.id ? null : r.id)} />
        {detail && (
          <div className="inc-detail">
            <h4>{detail.id} · {detail.system} · {detail.sev}</h4>
            <dl className="kv two">
              <div className="kv-row"><dt>Opened</dt><dd>{detail.opened}</dd></div>
              <div className="kv-row"><dt>Duration</dt><dd>{detail.durationHrs.toFixed(1)} hrs</dd></div>
              <div className="kv-row"><dt>Response</dt><dd>{detail.responseMin} min</dd></div>
              <div className="kv-row"><dt>Downtime procedures used</dt><dd>{detail.downtimeProcedures ? 'Yes' : 'No'}</dd></div>
              <div className="kv-row"><dt>Sites</dt><dd>{detail.sites.map((s) => ds.sites[s].short).join(', ')}</dd></div>
              <div className="kv-row"><dt>Root cause status</dt><dd>{detail.rcStatus}</dd></div>
            </dl>
            <p><b>Impact.</b> {detail.impact}.</p>
            <p><b>Resolution.</b> {detail.resolution}.</p>
            <p><b>Root cause.</b> {detail.rootCause}.</p>
            <p><b>Preventive action.</b> {detail.action}; {detail.owner}; due {detail.due} ({detail.actionStatus}).</p>
          </div>
        )}
      </Visual>

      <Band type="act" note="Corrective actions to work: open and overdue preventive actions" />
      <CorrectiveActions />
      <Commentary>{ds.commentary.incidents}</Commentary>
    </div>
  );
}

/** Open and overdue preventive actions from P1/P2 incidents up to the end of the period. */
function CorrectiveActions() {
  const { ds, ctx } = useApp();
  const rows = ds.incidents.filter((i) => i.mi <= ctx.mi && i.actionStatus !== 'Closed' && (!ctx.sites.length || i.sites.some((s) => ctx.sites.includes(s))));
  type R = (typeof rows)[number];
  const cols: Col<R>[] = [
    { key: 'action', label: 'Preventive action', width: 260, wrap: true, value: (r) => r.action },
    { key: 'inc', label: 'From incident', align: 'left', value: (r) => r.id, render: (r) => <span>{r.id} <span className="muted">· {r.system}</span></span> },
    { key: 'owner', label: 'Owner', align: 'left', value: (r) => r.owner },
    { key: 'due', label: 'Due', align: 'left', value: (r) => r.due },
    { key: 'st', label: 'Status', align: 'left', value: (r) => (r.actionStatus === 'Overdue' ? 0 : 1), render: (r) => <RagCell rag={r.actionStatus === 'Overdue' ? 'R' : 'A'} text={r.actionStatus} />, exportText: (r) => r.actionStatus },
  ];
  const g = rows.map((r) => ({ id: r.id, data: r }));
  return (
    <Visual title="Corrective actions to work" subtitle={`${rows.length} open · ${rows.filter((r) => r.actionStatus === 'Overdue').length} overdue · overdue first`} table={gridExport(cols, g)}>
      <Grid caption="Corrective actions" columns={cols} rows={g} dense defaultSort={{ key: 'st', dir: 'asc' }} />
    </Visual>
  );
}

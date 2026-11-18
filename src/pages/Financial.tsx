// Financial and Value (CFO view): what IT costs, budget position, unit costs, service credits and
// the estimated cost of downtime. All figures are mock.

import { fmt, fmtDelta, pct } from '../format';
import { CONTRACT_SLAS, evaluate, feeOf, finRows, incidentsIn, M, rawStatus, shiftCtx, priorShift, type Ctx } from '../metrics';
import { miOf } from '../periods';
import { useApp } from '../state';
import { Chart } from '../ui/Chart';
import { lineOption, SERIES, stackedOption } from '../ui/charts';
import { Band, Commentary, KpiStrip, RagCell } from '../ui/common';
import { Grid, gridExport, type Col } from '../ui/Grid';
import { CanvasHeader } from '../ui/Shell';
import { Visual } from '../ui/Visual';

const usd = (v: number | null | undefined) => fmt(v ?? null, 'usd');
const sum = <T,>(r: T[], f: (x: T) => number) => r.reduce((a, x) => a + f(x), 0);

export function Financial() {
  const { ds, ctx, period, cmpPeriod, set, go } = useApp();
  const ec: Ctx = { ...ctx, sites: [], pri: [], cat: [] };
  const f = finRows(ds, ec);
  const cc = shiftCtx(ec, priorShift(ec.kind));
  const fp = cc ? finRows(ds, cc) : [];
  const spend = sum(f, feeOf);
  const budget = sum(f, (x) => x.budgetRun);
  const credits = evaluate(ds, 'credits', ec).value ?? 0;
  const downtime = evaluate(ds, 'downtime_cost', ec).value ?? 0;

  // Spend components for the period vs comparison
  type Line = { name: string; cur: number; prior: number | null; budget: number | null };
  const lines: Line[] = [
    { name: 'Fixed monthly fee', cur: sum(f, (x) => x.feeFixed), prior: fp.length ? sum(fp, (x) => x.feeFixed) : null, budget: null },
    { name: 'Per-device charges', cur: sum(f, (x) => x.feeDevices), prior: fp.length ? sum(fp, (x) => x.feeDevices) : null, budget: null },
    { name: 'Ticket volume overage', cur: sum(f, (x) => x.feeOverage), prior: fp.length ? sum(fp, (x) => x.feeOverage) : null, budget: null },
    { name: 'Managed IT services (run)', cur: spend, prior: fp.length ? sum(fp, feeOf) : null, budget },
    { name: 'Project portfolio', cur: sum(f, (x) => x.projectSpend), prior: fp.length ? sum(fp, (x) => x.projectSpend) : null, budget: sum(f, (x) => x.projectBudget) },
    { name: 'Service credits (offset)', cur: -credits, prior: cc ? -(evaluate(ds, 'credits', cc).value ?? 0) : null, budget: null },
  ];
  const net = { name: 'Net IT cost', cur: spend + sum(f, (x) => x.projectSpend) - credits, prior: fp.length ? sum(fp, (x) => feeOf(x) + x.projectSpend) - (cc ? evaluate(ds, 'credits', cc).value ?? 0 : 0) : null, budget: budget + sum(f, (x) => x.projectBudget) };
  const lcols: Col<Line>[] = [
    { key: 'name', label: 'Cost line', width: 220, value: (r) => r.name, render: (r) => (r.name.startsWith('Managed') || r.name.startsWith('Net') ? <b>{r.name}</b> : r.name) },
    { key: 'cur', label: period.short, text: period.label, value: (r) => r.cur, render: (r) => usd(r.cur), bar: true },
    { key: 'budget', label: 'Budget', value: (r) => r.budget, render: (r) => (r.budget === null ? '' : usd(r.budget)) },
    { key: 'var', label: 'Variance to budget', value: (r) => (r.budget === null ? null : r.cur - r.budget), render: (r) => (r.budget === null ? '' : <span className={r.cur > r.budget ? 'txt-off' : 'txt-ok'}>{fmtDelta(r.cur - r.budget, 'usd')}</span>), exportText: (r) => (r.budget === null ? '' : Math.round(r.cur - r.budget)) },
    { key: 'pct', label: '% of budget', value: (r) => (r.budget ? r.cur / r.budget : null), render: (r) => (r.budget ? pct(r.cur / r.budget) : '') },
    { key: 'prior', label: cmpPeriod.short, text: cmpPeriod.label, value: (r) => r.prior, render: (r) => usd(r.prior) },
    { key: 'chg', label: 'Change', value: (r) => (r.prior === null ? null : r.cur - r.prior), render: (r) => (r.prior === null ? '–' : fmtDelta(r.cur - r.prior, 'usd')) },
  ];
  const lg = lines.map((l) => ({ id: l.name, data: l }));

  // Monthly spend vs budget (13 months) and cumulative for the year
  const months = ds.months.filter((m) => m.mi <= ctx.mi && m.mi > ctx.mi - 13);
  const fin = (mi: number) => ds.finance[mi];
  const yearMis = Array.from({ length: 12 }, (_, k) => miOf(ds, period.year, k));
  // Monthly run budget for the year (budget is set per year); the year's budget line runs Jan to Dec.
  const monthlyBudget = ds.finance[yearMis.find((mi) => mi >= 0)!].budgetRun;
  const fullBudget = monthlyBudget * 12;
  const pyMis = yearMis.map((_, k) => miOf(ds, period.year - 1, k));
  let cs = 0; let cpy = 0;
  const cum = yearMis.map((mi, k) => {
    const pm = pyMis[k];
    cpy += pm >= 0 ? feeOf(fin(pm)) : 0;
    const py = pm >= 0 ? cpy : null;
    if (mi < 0 || mi > ds.currentMi) return { s: null, b: monthlyBudget * (k + 1), py };
    cs += feeOf(fin(mi));
    return { s: cs, b: monthlyBudget * (k + 1), py };
  });
  const ytdMonths = yearMis.filter((mi) => mi >= 0 && mi <= ds.currentMi).length;
  const forecast = ytdMonths ? (cs / ytdMonths) * 12 : null;

  // Service credits and downtime cost detail
  type CR = { label: string; credit: number; months: number };
  const creditRows: CR[] = CONTRACT_SLAS.map((s) => {
    const missed = ec.mis.filter((mi) => rawStatus(ds, M(s.id), { ...ec, mi, mis: [mi], kind: 'month' }) === 'off');
    return { label: s.label, credit: missed.length * s.creditUsd, months: missed.length };
  }).filter((r) => r.months > 0);
  const crCols: Col<CR>[] = [
    { key: 'label', label: 'Service level missed', value: (r) => r.label },
    { key: 'months', label: 'Months missed', value: (r) => r.months },
    { key: 'credit', label: 'Credit', value: (r) => r.credit, render: (r) => usd(r.credit), bar: true },
  ];
  const incs = incidentsIn(ds, ec).filter((i) => i.clinicalDowntimeHrs > 0);
  type IR = (typeof incs)[number];
  const iCols: Col<IR>[] = [
    { key: 'id', label: 'Incident', value: (r) => r.id },
    { key: 'sys', label: 'System', align: 'left', value: (r) => r.system },
    { key: 'hrs', label: 'Clinical downtime', value: (r) => r.clinicalDowntimeHrs, render: (r) => `${r.clinicalDowntimeHrs.toFixed(1)} hrs` },
    { key: 'cost', label: 'Est. cost', value: (r) => r.clinicalDowntimeHrs * ds.downtimeCostPerHour, render: (r) => usd(r.clinicalDowntimeHrs * ds.downtimeCostPerHour), bar: true },
  ];

  // Projects budget
  type P = (typeof ds.projects)[number];
  const pCols: Col<P>[] = [
    { key: 'name', label: 'Project', width: 200, value: (r) => r.name },
    { key: 'budget', label: 'Budget', value: (r) => r.budgetUsd, render: (r) => usd(r.budgetUsd) },
    { key: 'spent', label: 'Spent to date', value: (r) => r.spentUsd, render: (r) => usd(r.spentUsd), bar: true },
    { key: 'pctSpent', label: '% spent', value: (r) => r.spentUsd / r.budgetUsd, render: (r) => pct(r.spentUsd / r.budgetUsd, 0), status: (r) => (r.spentUsd > r.budgetUsd ? 'off' : r.spentUsd / r.budgetUsd > r.pctComplete + 0.1 ? 'watch' : 'ok') },
    { key: 'pctDone', label: '% complete', value: (r) => r.pctComplete, render: (r) => pct(r.pctComplete, 0) },
    { key: 'remaining', label: 'Remaining budget', value: (r) => r.budgetUsd - r.spentUsd, render: (r) => <span className={r.budgetUsd < r.spentUsd ? 'txt-off' : ''}>{usd(r.budgetUsd - r.spentUsd)}</span> },
    { key: 'budgetRag', label: 'Budget status', align: 'left', value: (r) => r.budget, render: (r) => <RagCell rag={r.budget} /> },
  ];
  const pg = ds.projects.map((p) => ({ id: p.name, data: p }));
  const ptotal: P = { ...ds.projects[0], name: 'Portfolio total', budgetUsd: sum(ds.projects, (p) => p.budgetUsd), spentUsd: sum(ds.projects, (p) => p.spentUsd), pctComplete: sum(ds.projects, (p) => p.pctComplete * p.budgetUsd) / sum(ds.projects, (p) => p.budgetUsd), budget: 'A' };

  return (
    <div className="page">
      <CanvasHeader />
      <Band type="kpi" note={`Are IT costs on budget and unit costs at target? · ${period.label} · mock figures`} />
      <KpiStrip ids={[
        { id: 'it_spend', label: 'Managed IT spend', sub: () => <span className="muted">Budget {usd(budget)} · {fmtDelta(spend - budget, 'usd')}</span> },
        'spend_vs_budget', 'total_it_cost', 'project_spend',
      ]} />
      <KpiStrip ids={['cost_ticket', 'cost_user', 'cost_device',
        { id: 'credits', label: 'Service credits applied', sub: () => <span className="muted">{creditRows.length} service levels missed</span> },
        { id: 'downtime_cost', label: 'Est. cost of clinical downtime', sub: () => <span className="muted">{incs.reduce((a, i) => a + i.clinicalDowntimeHrs, 0).toFixed(1)} hrs × {usd(ds.downtimeCostPerHour)}/hr</span> },
      ]} />
      <Visual title="IT cost summary" subtitle={`${period.label} vs ${cmpPeriod.label}`} table={gridExport(lcols, lg, net)}>
        <Grid caption="IT cost summary" columns={lcols} rows={lg} total={net} dense />
      </Visual>

      <Band type="trend" />
      <div className="row cols-7-5">
        <Visual title="Managed IT spend vs budget, monthly" metricId="it_spend" subtitle="Columns: fee components · line: run budget · click a month to set the period"
          table={{ columns: ['Month', 'Fixed fee', 'Devices', 'Overage', 'Total', 'Budget'], rows: months.map((m) => { const x = fin(m.mi); return [m.label, x.feeFixed, x.feeDevices, x.feeOverage, feeOf(x), x.budgetRun]; }) }}>
          <Chart height={250} ariaLabel="Spend vs budget by month" onClick={(i) => months[i] && set({ mi: months[i].mi, pk: 'month' })}
            option={stackedOption({ labels: months.map((m) => m.short), fmt: (v) => usd(v), line: { name: 'Budget', data: months.map((m) => fin(m.mi).budgetRun) },
              series: [{ name: 'Fixed fee', data: months.map((m) => fin(m.mi).feeFixed), color: SERIES[0] }, { name: 'Devices', data: months.map((m) => fin(m.mi).feeDevices), color: '#86b6ef' }, { name: 'Overage', data: months.map((m) => fin(m.mi).feeOverage), color: SERIES[1] }] })} />
        </Visual>
        <Visual title={`Cumulative spend vs budget, ${period.year}`} subtitle={`Year to date ${usd(cs)} of ${usd(fullBudget)} annual run budget · run-rate forecast ${usd(forecast)} (${forecast ? pct(forecast / fullBudget, 0) : '–'} of budget)`}
          table={{ columns: ['Month', 'Cumulative spend', 'Cumulative budget', 'Prior year'], rows: yearMis.map((_, k) => [['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][k], cum[k].s, cum[k].b, cum[k].py]) }}>
          <Chart height={250} ariaLabel="Cumulative spend vs budget"
            option={lineOption({ labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], fmt: (v) => usd(v), min: 0,
              series: [{ name: `${period.year} spend`, data: cum.map((c) => c.s), color: SERIES[0] }, { name: 'Budget', data: cum.map((c) => c.b), color: '#4b5361', dashed: true }, { name: `${period.year - 1} spend`, data: cum.map((c) => c.py), color: '#a9b0bb' }] })} />
        </Visual>
      </div>

      <Band type="where" note="Where does IT cost go: by site and by service line (allocated by ticket share)" />
      <div className="row cols-2">
        <CostBy dim="site" />
        <CostBy dim="svc" />
      </div>

      <Band type="why" note="What drives cost beyond plan: service credits for missed service levels and the cost of downtime" />
      <div className="row cols-2">
        <Visual title="Service credits by service level" metricId="credits" subtitle={`${period.label} · credit per month missed (A1)`} table={gridExport(crCols, creditRows.map((r) => ({ id: r.label, data: r })))}>
          <Grid caption="Service credits" columns={crCols} rows={creditRows.map((r) => ({ id: r.label, data: r }))} dense defaultSort={{ key: 'credit', dir: 'desc' }} />
        </Visual>
        <Visual title="Estimated cost of clinical downtime" metricId="downtime_cost" subtitle={`Major incidents with clinical downtime · planning assumption ${usd(ds.downtimeCostPerHour)} per hour (mock)`} table={gridExport(iCols, incs.map((i) => ({ id: i.id, data: i })))}>
          <Grid caption="Downtime cost" columns={iCols} rows={incs.map((i) => ({ id: i.id, data: i }))} dense defaultSort={{ key: 'cost', dir: 'desc' }} />
        </Visual>
      </div>

      <Band type="act" note="Budget decisions to make and project spend to manage" actions={<button type="button" className="btn btn-primary btn-sm" onClick={() => go('projects')}>Projects, actions and decisions ›</button>} />
      <FinancialDecisions />
      <Visual title="Project budgets" subtitle="Amber when spend runs more than 10 points ahead of completion; red when over budget" table={gridExport(pCols, pg, ptotal)}>
        <Grid caption="Project budgets" columns={pCols} rows={pg} total={ptotal} dense defaultSort={{ key: 'budget', dir: 'desc' }} />
      </Visual>

      <Commentary title="What the CFO should know">
        {period.label}: managed IT spend {usd(spend)} against a {usd(budget)} run budget ({pct(budget ? spend / budget : null)}).
        {' '}Cost per ticket is {fmt(evaluate(ds, 'cost_ticket', ec).value, 'usd')} and cost per user is {fmt(evaluate(ds, 'cost_user', ec).value, 'usd')} per month.
        {' '}Service credits of {usd(credits)} were applied for missed service levels; estimated downtime cost was {usd(downtime)}.
        {' '}{period.year} run-rate forecast is {usd(forecast)} against a {usd(fullBudget)} annual run budget. The clinic network project is 6% over budget and needs a decision (see Projects).
      </Commentary>
      <p className="footnote">Mock financials for demonstration. Run budget and fee structure are illustrative; replace with the client's contract and budget.</p>
    </div>
  );
}

/** Managed IT spend allocated by share of tickets, to sites or to service lines (a simple chargeback view). */
function CostBy({ dim }: { dim: 'site' | 'svc' }) {
  const { ds, ctx, period } = useApp();
  const ec: Ctx = { ...ctx, pri: [], cat: [], svc: [] };
  const spend = sum(finRows(ds, ec), feeOf);
  const inScope = ds.tickets.filter((t) => ec.mis.includes(t.mi) && (!ec.sites.length || ec.sites.includes(t.site)));
  const all = sum(inScope, (t) => t.opened);
  type R = { key: number; name: string; group: string; tickets: number; share: number; cost: number };
  const members = dim === 'site'
    ? ds.sites.filter((x) => !ec.sites.length || ec.sites.includes(x.key)).map((x) => ({ key: x.key, name: x.short, group: ds.facilityTypes[x.facilityType] }))
    : ds.serviceLines.map((x) => ({ key: x.key, name: x.name, group: ds.patientTypes[x.patientType] }));
  const rows: R[] = members.map((m) => {
    const n = sum(inScope.filter((t) => (dim === 'site' ? t.site : t.svc) === m.key), (t) => t.opened);
    return { ...m, tickets: n, share: all ? n / all : 0, cost: all ? (spend * n) / all : 0 };
  });
  const cols: Col<R>[] = [
    { key: 'name', label: dim === 'site' ? 'Site' : 'Service line', width: 170, value: (r) => r.name },
    { key: 'group', label: dim === 'site' ? 'Facility type' : 'Patient type', align: 'left', value: (r) => r.group },
    { key: 'tickets', label: 'Tickets', value: (r) => r.tickets, render: (r) => r.tickets.toLocaleString() },
    { key: 'share', label: 'Share', value: (r) => r.share, render: (r) => pct(r.share, 0) },
    { key: 'cost', label: 'Allocated IT cost', value: (r) => r.cost, render: (r) => usd(r.cost), bar: true },
  ];
  const g = rows.map((r) => ({ id: String(r.key), data: r }));
  return (
    <Visual title={`Managed IT cost by ${dim === 'site' ? 'site' : 'service line'}`} subtitle={`${period.label} · managed services spend allocated by share of tickets (illustrative chargeback)`} table={gridExport(cols, g)}>
      <Grid caption={`IT cost by ${dim}`} columns={cols} rows={g} dense defaultSort={{ key: 'cost', dir: 'desc' }} maxHeight={380} />
    </Visual>
  );
}

/** Decisions with a budget impact (MOR slide 13), shown in the Act band. */
function FinancialDecisions() {
  const { ds } = useApp();
  return (
    <section className="visual">
      <div className="visual-head"><div className="visual-titles"><h3>Decisions with a budget impact</h3><div className="visual-sub">From the MOR decisions log · recommendation, decision maker and cost of delay</div></div></div>
      <div className="visual-body">
        <ol className="decision-list">
          {ds.decisions.map((d) => (
            <li key={d.decision}><b>{d.decision}.</b> Options: {d.options}. Convene recommends {d.recommend}.
              <div className="action-meta">Decision maker: {d.maker} · Needed by {d.by} · Cost of delay: {d.costOfDelay}.</div></li>
          ))}
        </ol>
      </div>
    </section>
  );
}

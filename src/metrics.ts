// Metric catalog and status engine.
//
// Each metric carries its MOR definition (A2), target and amber band (Convene default, confirm per
// contract), source system, data owner and a compute function over the Dataset. Status follows A4:
//   Green  = meets or beats target.
//   Amber  = misses target inside the amber band, or meets target with an unfavorable 3-month trend.
//   Red    = misses target outside the amber band, or misses target three months in a row.
//   Grey   = not measured, or no target.

import type { Dataset, Pri, TicketFact } from './data/model';
import { RESOLVE_TARGET_HRS, RESP_TARGET_MIN, SLA_TARGET } from './data/generate';
import type { Unit } from './format';
import type { PeriodKind } from './periods';

export type Status = 'ok' | 'watch' | 'off' | 'none';
export type Area = 'Executive' | 'Financial' | 'Service Desk' | 'Clinical Systems' | 'Infrastructure' | 'Major Incidents' | 'Security' | 'Change';
export const AREAS: Area[] = ['Executive', 'Financial', 'Service Desk', 'Clinical Systems', 'Infrastructure', 'Major Incidents', 'Security', 'Change'];
export type TrendLabel = 'Favorable' | 'Stable' | 'Unfavorable' | 'Up' | 'Down' | '–';

/** A4 trend rule threshold: moved more than this share of the prior value. */
export const TREND_THRESHOLD = 0.05;

/**
 * Evaluation context: the period (end month mi and its months mis, of a kind) plus filters.
 * Row-based measures sum their numerators and denominators over mis; others combine monthly
 * values by the metric's `agg` rule.
 */
export interface Ctx { mi: number; mis: number[]; kind: PeriodKind; sites: number[]; pri: Pri[]; cat: number[] }

/** A one-month context at month mi (used for trends and month-only rules). */
export const monthCtx = (c: Ctx, mi: number): Ctx => ({ ...c, mi, mis: [mi], kind: 'month' });
/** The same context shifted back by n months (null if it runs off the start of the data). */
export function shiftCtx(c: Ctx, n: number): Ctx | null {
  const mis = c.mis.map((x) => x - n);
  if (!mis.length || mis.some((x) => x < 0)) return null;
  return { ...c, mi: c.mi - n, mis };
}
/** Months to shift for the comparison period. */
export const priorShift = (k: PeriodKind) => (k === 'month' ? 1 : k === 'quarter' ? 3 : 12);

export interface MetricDef {
  id: string; code: string; name: string; short?: string; area: Area; unit: Unit; digits?: number;
  target: number | null; better: 'up' | 'down' | 'none'; amber?: number;
  targetText?: string; amberText?: string;
  definition: string; source: string; owner: string;
  /** 'site': the site filter applies. 'enterprise': measured once for the whole client. */
  scope: 'site' | 'enterprise';
  page: string;
  compute: (ds: Dataset, c: Ctx) => number | null;
  /**
   * How a multi-month period combines: 'rows' (default) = compute over all months' rows at once
   * (ratios stay weighted); 'sum' | 'mean' | 'max' = combine monthly values; 'last' = month-end
   * snapshot at the end of the period.
   */
  agg?: 'rows' | 'sum' | 'mean' | 'last' | 'max';
  /** Target is per month: a quarter's target is 3x, a year's 12x. */
  perMonth?: boolean;
  targetFn?: (ds: Dataset, c: Ctx) => number | null;
  amberFn?: (ds: Dataset, c: Ctx) => number;
  statusFn?: (ds: Dataset, c: Ctx, v: number | null) => Status;
}

// ---------------------------------------------------------------- indexes (built once per dataset)

const idx = new WeakMap<Dataset, { t: TicketFact[][]; sm: Dataset['siteMonths'][]; sys: Dataset['systemMonths'][] }>();
function I(ds: Dataset) {
  let x = idx.get(ds);
  if (!x) {
    const n = ds.months.length;
    x = { t: Array.from({ length: n }, () => []), sm: Array.from({ length: n }, () => []), sys: Array.from({ length: n }, () => []) };
    ds.tickets.forEach((r) => x!.t[r.mi].push(r));
    ds.siteMonths.forEach((r) => x!.sm[r.mi].push(r));
    ds.systemMonths.forEach((r) => x!.sys[r.mi].push(r));
    idx.set(ds, x);
  }
  return x;
}

const validMis = (ds: Dataset, mis: number[]) => mis.filter((mi) => mi >= 0 && mi < ds.months.length);
export function ticketRows(ds: Dataset, c: Ctx, over: Partial<Ctx> = {}) {
  const cc = { ...c, ...over };
  return validMis(ds, cc.mis).flatMap((mi) => I(ds).t[mi]).filter((r) => (!cc.sites.length || cc.sites.includes(r.site)) && (!cc.pri.length || cc.pri.includes(r.pri)) && (!cc.cat.length || cc.cat.includes(r.cat)));
}
export function siteRows(ds: Dataset, c: Ctx) {
  return validMis(ds, c.mis).flatMap((mi) => I(ds).sm[mi]).filter((r) => !c.sites.length || c.sites.includes(r.site));
}
/** Clinical system rows for one month or a set of months. */
export function systemRows(ds: Dataset, mis: number | number[]) {
  return validMis(ds, Array.isArray(mis) ? mis : [mis]).flatMap((mi) => I(ds).sys[mi]);
}
export function finRows(ds: Dataset, c: Ctx) { return validMis(ds, c.mis).map((mi) => ds.finance[mi]); }
export const feeOf = (f: Dataset['finance'][number]) => f.feeFixed + f.feeDevices + f.feeOverage;
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);
const ratio = (n: number, d: number) => (d > 0 ? n / d : null);
const inMonth = (ds: Dataset, mi: number) => mi >= 0 && mi < ds.months.length;
const infra = (ds: Dataset, mi: number) => (inMonth(ds, mi) ? ds.infra[mi] : null);
const sec = (ds: Dataset, mi: number) => (inMonth(ds, mi) ? ds.security[mi] : null);

function availability(ds: Dataset, mis: number | number[], filter: (sys: number) => boolean) {
  const rows = systemRows(ds, mis).filter((r) => filter(r.sys));
  if (!rows.length) return null;
  return 1 - sum(rows, (r) => r.unplannedMin) / sum(rows, (r) => r.totalMin);
}
export function systemAvailability(ds: Dataset, mis: number | number[], sys: number) { return availability(ds, mis, (s) => s === sys); }
const tierOf = (ds: Dataset, sys: number) => ds.systems[sys].tier;

export function incidentsIn(ds: Dataset, c: Ctx) {
  return ds.incidents.filter((i) => c.mis.includes(i.mi) && (!c.sites.length || i.sites.some((s) => c.sites.includes(s))));
}
const usersShare = (ds: Dataset, c: Ctx) => (c.sites.length ? sum(ds.sites.filter((s) => c.sites.includes(s.key)), (s) => s.weight) : 1);

// ---------------------------------------------------------------- catalog

const ITSM = 'IT service management tool';
const MON = 'Monitoring tool; downtime log';
const pri = (p: Pri) => (c: Ctx) => ({ ...c, pri: c.pri.length && !c.pri.includes(p) ? ['__none__' as Pri] : [p] });

function slaMetric(p: Pri, code: string): MetricDef {
  return {
    id: `sla_${p.toLowerCase()}`, code, name: `SLA compliance, ${p === 'SR' ? 'service requests' : p}`, short: `SLA ${p}`, area: 'Service Desk', unit: 'pct',
    target: SLA_TARGET[p], better: 'up', amber: p === 'P1' ? 0 : p === 'P2' ? 0.01 : 0.02, amberText: p === 'P1' ? 'Any miss is red' : undefined,
    definition: `${p} tickets meeting the contracted SLA ÷ eligible ${p} tickets resolved in the month.`, source: ITSM, owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    compute: (ds, c) => { const r = ticketRows(ds, pri(p)(c)); return ratio(sum(r, (x) => x.slaMet), sum(r, (x) => x.resolved)); },
  };
}
function respMetric(p: Pri, code: string, kind: 'resp' | 'res'): MetricDef {
  const resp = kind === 'resp';
  return {
    id: `${kind}_${p.toLowerCase()}`, code, name: `${resp ? 'Avg time to respond' : 'Avg time to resolve'}, ${p}`, short: `${resp ? 'Respond' : 'Resolve'} ${p}`, area: 'Service Desk',
    unit: resp ? 'min' : 'hrs', digits: resp ? 0 : 1, target: resp ? RESP_TARGET_MIN[p] : RESOLVE_TARGET_HRS[p], better: 'down', amber: resp ? RESP_TARGET_MIN[p] * 0.2 : RESOLVE_TARGET_HRS[p] * 0.2,
    definition: resp ? `Average time from ticket opened to first qualified response, ${p}.` : `Average time from ticket opened to resolved, ${p}, on the contract clock.`,
    source: ITSM, owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    compute: (ds, c) => { const r = ticketRows(ds, pri(p)(c)); return ratio(sum(r, (x) => (resp ? x.respMinSum : x.resolveHrsSum)), sum(r, (x) => x.resolved)); },
  };
}

/** Contract service levels used for "Service levels met" and appendix A1. */
export const CONTRACT_SLAS: { id: string; label: string; ref: string; creditUsd: number }[] = [
  { id: 'resp_p1', label: 'P1 response time', ref: 'Sch. B 2.1', creditUsd: 7500 },
  { id: 'res_p1', label: 'P1 service restored', ref: 'Sch. B 2.2', creditUsd: 10000 },
  { id: 'resp_p2', label: 'P2 response time', ref: 'Sch. B 2.3', creditUsd: 4000 },
  { id: 'sla_p2', label: 'P2 resolved within SLA', ref: 'Sch. B 2.4', creditUsd: 5000 },
  { id: 'sla_p3', label: 'P3 resolved within SLA', ref: 'Sch. B 2.5', creditUsd: 2500 },
  { id: 'sla_p4', label: 'P4 resolved within SLA', ref: 'Sch. B 2.5', creditUsd: 1500 },
  { id: 'asa', label: 'Service desk speed to answer', ref: 'Sch. B 3.1', creditUsd: 2000 },
  { id: 'abandon', label: 'Call abandonment rate', ref: 'Sch. B 3.2', creditUsd: 2000 },
  { id: 'ehr_avail', label: 'EHR availability', ref: 'Sch. C 1.1', creditUsd: 15000 },
  { id: 'network', label: 'Network availability', ref: 'Sch. C 1.3', creditUsd: 6000 },
  { id: 'backup', label: 'Backup success rate', ref: 'Sch. C 2.1', creditUsd: 3000 },
  { id: 'crit7', label: 'Critical patches within 7 days', ref: 'Sch. D 1.2', creditUsd: 4000 },
];

export const METRICS: MetricDef[] = [
  // ---------------- Executive
  {
    id: 'svc_levels_met', code: 'EX-02', name: 'Service levels met', area: 'Executive', unit: 'pct', digits: 0, target: 1, better: 'up', amber: 0.1,
    definition: 'Contract service levels (A1) met in the month ÷ contract service levels measured.', source: 'Calculated from A1', owner: 'Service Delivery Lead', scope: 'enterprise', page: 'reference',
    compute: (ds, c) => {
      const st = CONTRACT_SLAS.map((s) => rawStatus(ds, M(s.id), { ...c, sites: [], pri: [], cat: [] }));
      const measured = st.filter((s) => s !== 'none');
      return ratio(measured.filter((s) => s === 'ok').length, measured.length);
    },
  },
  {
    id: 'open_critical', agg: 'last', code: 'EX-05', name: 'Open critical issues', area: 'Executive', unit: 'count', target: null, better: 'down',
    definition: 'Open critical vulnerabilities + open high-severity security incidents + PHI exposure events at month end.', source: 'Vulnerability scanner; incident register', owner: 'Chief Information Security Officer', scope: 'enterprise', page: 'security',
    compute: (ds, c) => { const s = sec(ds, c.mi); return s ? s.vulnC + s.incHigh + s.phiEvents : null; },
  },
  {
    id: 'credits', code: 'EX-06', name: 'Service credits applied', short: 'Service credits', area: 'Executive', unit: 'usd', target: null, better: 'none', agg: 'sum',
    definition: 'Contract service credits owed to the client for missed service levels (A1), by month of the miss.', source: 'Calculated from A1; credit memos', owner: 'Client Service Executive', scope: 'enterprise', page: 'reference',
    compute: (ds, c) => sum(CONTRACT_SLAS, (s) => (rawStatus(ds, M(s.id), { ...c, sites: [], pri: [], cat: [] }) === 'off' ? s.creditUsd : 0)),
  },
  // ---------------- Financial (CFO view; mock figures)
  {
    id: 'it_spend', code: 'FN-01', name: 'Managed IT services spend', short: 'Managed IT spend', area: 'Financial', unit: 'usd', target: null, better: 'down',
    targetText: 'Run budget for the period', definition: 'Fixed monthly fee + per-device charges + ticket overage billed for the period.', source: 'Invoices; finance system', owner: 'Chief Financial Officer', scope: 'enterprise', page: 'financial',
    compute: (ds, c) => (c.mis.length ? sum(finRows(ds, c), feeOf) : null),
    targetFn: (ds, c) => (c.mis.length ? sum(finRows(ds, c), (f) => f.budgetRun) : null),
    amberFn: (ds, c) => sum(finRows(ds, c), (f) => f.budgetRun) * 0.03,
  },
  {
    id: 'spend_vs_budget', code: 'FN-02', name: 'Run spend vs budget', short: 'Spend vs budget', area: 'Financial', unit: 'pct', digits: 1, target: 1, better: 'down', amber: 0.03, targetText: '≤ 100%', amberText: 'Amber up to 103%',
    definition: 'Managed IT services spend ÷ run budget for the same months.', source: 'Invoices; budget', owner: 'Chief Financial Officer', scope: 'enterprise', page: 'financial',
    compute: (ds, c) => { const f = finRows(ds, c); return ratio(sum(f, feeOf), sum(f, (x) => x.budgetRun)); },
  },
  {
    id: 'cost_ticket', code: 'FN-03', name: 'Cost per ticket resolved', short: 'Cost per ticket', area: 'Financial', unit: 'usd', target: 60, better: 'down', amber: 5, targetText: '≤ $60',
    definition: 'Service desk share of the managed services fee ÷ tickets resolved.', source: 'Invoices; ITSM', owner: 'Chief Financial Officer', scope: 'enterprise', page: 'financial',
    compute: (ds, c) => ratio(sum(finRows(ds, c), (f) => feeOf(f) * f.serviceDeskShare), sum(ticketRows(ds, { ...c, sites: [], pri: [], cat: [] }), (x) => x.resolved)),
  },
  {
    id: 'cost_user', code: 'FN-04', name: 'IT cost per user per month', short: 'Cost per user / month', area: 'Financial', unit: 'usd', target: 55, better: 'down', amber: 3, targetText: '≤ $55',
    definition: 'Managed services spend ÷ active users, per month.', source: 'Invoices; identity platform', owner: 'Chief Financial Officer', scope: 'enterprise', page: 'financial',
    compute: (ds, c) => { const f = finRows(ds, c); return ratio(sum(f, feeOf), sum(f, (x) => x.users)); },
  },
  {
    id: 'cost_device', code: 'FN-05', name: 'IT cost per device per month', short: 'Cost per device / month', area: 'Financial', unit: 'usd', target: 42, better: 'down', amber: 2, targetText: '≤ $42',
    definition: 'Managed services spend ÷ managed devices, per month.', source: 'Invoices; asset inventory', owner: 'Chief Financial Officer', scope: 'enterprise', page: 'financial',
    compute: (ds, c) => { const f = finRows(ds, c); return ratio(sum(f, feeOf), sum(f, (x) => x.devices)); },
  },
  {
    id: 'project_spend', code: 'FN-06', name: 'Project spend vs plan', short: 'Project spend vs plan', area: 'Financial', unit: 'pct', digits: 0, target: 1, better: 'down', amber: 0.05, targetText: '≤ 100% of plan', amberText: 'Amber up to 105%',
    definition: 'Project portfolio spend ÷ planned project spend for the same months.', source: 'Project register; finance system', owner: 'Chief Financial Officer', scope: 'enterprise', page: 'financial',
    compute: (ds, c) => { const f = finRows(ds, c); return ratio(sum(f, (x) => x.projectSpend), sum(f, (x) => x.projectBudget)); },
  },
  {
    id: 'downtime_cost', code: 'FN-07', name: 'Estimated cost of clinical downtime', short: 'Downtime cost (est.)', area: 'Financial', unit: 'usd', target: null, better: 'down',
    definition: 'Clinical downtime hours from P1/P2 incidents × planning cost per hour (mock assumption: $42,000 per hour).', source: 'Incident register; finance assumption', owner: 'Chief Financial Officer', scope: 'site', page: 'financial',
    compute: (ds, c) => (c.mis.length ? sum(incidentsIn(ds, c), (i) => i.clinicalDowntimeHrs) * ds.downtimeCostPerHour : null),
  },
  {
    id: 'total_it_cost', code: 'FN-08', name: 'Total IT cost (run + projects)', short: 'Total IT cost', area: 'Financial', unit: 'usd', target: null, better: 'down',
    targetText: 'Run + project budget for the period', definition: 'Managed services spend plus project portfolio spend.', source: 'Finance system', owner: 'Chief Financial Officer', scope: 'enterprise', page: 'financial',
    compute: (ds, c) => (c.mis.length ? sum(finRows(ds, c), (f) => feeOf(f) + f.projectSpend) : null),
    targetFn: (ds, c) => (c.mis.length ? sum(finRows(ds, c), (f) => f.budgetRun + f.projectBudget) : null),
    amberFn: (ds, c) => sum(finRows(ds, c), (f) => f.budgetRun + f.projectBudget) * 0.03,
  },
  // ---------------- Service desk
  {
    id: 'tickets_opened', code: 'SD-01', name: 'Tickets opened', area: 'Service Desk', unit: 'count', target: null, better: 'none',
    definition: 'Tickets opened in the month, reported separately for P1, P2, P3, P4 and service requests.', source: ITSM, owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    compute: (ds, c) => (c.mis.length ? sum(ticketRows(ds, c), (x) => x.opened) : null),
  },
  {
    id: 'tickets_resolved', code: 'SD-02', name: 'Tickets resolved', area: 'Service Desk', unit: 'count', target: null, better: 'none',
    definition: 'Tickets resolved in the month.', source: ITSM, owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    compute: (ds, c) => (c.mis.length ? sum(ticketRows(ds, c), (x) => x.resolved) : null),
  },
  {
    id: 'throughput', code: 'SD-03', name: 'Resolved as % of opened', short: 'Throughput', area: 'Service Desk', unit: 'pct', digits: 0, target: null, better: 'up',
    definition: 'Tickets resolved ÷ tickets opened in the month. Below 100% grows the backlog.', source: ITSM, owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    compute: (ds, c) => { const r = ticketRows(ds, c); return ratio(sum(r, (x) => x.resolved), sum(r, (x) => x.opened)); },
  },
  {
    id: 'sla_all', code: 'SD-04', name: 'Tickets resolved within SLA', short: 'SLA, all tickets', area: 'Service Desk', unit: 'pct', target: 0.95, better: 'up', amber: 0.02,
    definition: 'Tickets meeting the contracted SLA ÷ eligible tickets resolved, all priorities.', source: ITSM, owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    compute: (ds, c) => { const r = ticketRows(ds, c); return ratio(sum(r, (x) => x.slaMet), sum(r, (x) => x.resolved)); },
  },
  slaMetric('P1', 'SD-05'), slaMetric('P2', 'SD-06'), slaMetric('P3', 'SD-07'), slaMetric('P4', 'SD-08'),
  respMetric('P1', 'SD-09', 'resp'), respMetric('P2', 'SD-10', 'resp'), respMetric('P3', 'SD-11', 'resp'), respMetric('P4', 'SD-12', 'resp'),
  respMetric('P1', 'SD-13', 'res'), respMetric('P2', 'SD-14', 'res'), respMetric('P3', 'SD-15', 'res'), respMetric('P4', 'SD-16', 'res'),
  {
    id: 'fcr', code: 'SD-17', name: 'First-call resolution', short: 'First-call resolution', area: 'Service Desk', unit: 'pct', target: 0.75, better: 'up', amber: 0.03,
    definition: 'Tickets resolved by the service desk on first contact ÷ service desk tickets.', source: ITSM, owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    compute: (ds, c) => { const r = siteRows(ds, c); return ratio(sum(r, (x) => x.fcrFirst), sum(r, (x) => x.fcrEligible)); },
  },
  {
    id: 'asa', code: 'SD-18', name: 'Average speed to answer', short: 'Speed to answer', area: 'Service Desk', unit: 'sec', target: 30, better: 'down', amber: 10,
    definition: 'Average seconds from a call entering the queue to an agent answering.', source: 'Phone system', owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    compute: (ds, c) => { const r = siteRows(ds, c); return ratio(sum(r, (x) => x.asaSecSum), sum(r, (x) => x.callsAnswered)); },
  },
  {
    id: 'abandon', code: 'SD-19', name: 'Call abandonment rate', short: 'Abandonment', area: 'Service Desk', unit: 'pct', target: 0.05, better: 'down', amber: 0.01,
    definition: 'Calls ended before answer ÷ calls offered; excludes calls under 10 seconds.', source: 'Phone system', owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    compute: (ds, c) => { const r = siteRows(ds, c); return ratio(sum(r, (x) => x.callsAbandoned), sum(r, (x) => x.callsOffered)); },
  },
  {
    id: 'backlog_open', code: 'SD-20', name: 'Open backlog at month end', short: 'Open backlog', area: 'Service Desk', unit: 'count', target: null, better: 'down',
    definition: 'Open incidents and requests at month end.', source: ITSM, owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    agg: 'last', compute: (ds, c) => (c.mis.length ? sum(siteRows(ds, c), (x) => x.backlogOpen) : null),
  },
  {
    id: 'over7', code: 'SD-21', name: 'Tickets open more than 7 days', short: 'Open > 7 days', area: 'Service Desk', unit: 'count', target: 60, better: 'down', amber: 15,
    targetText: '≤ 60 (scaled to the sites selected)', definition: 'Open incidents and requests at month end older than 7 calendar days.', source: ITSM, owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    agg: 'last', compute: (ds, c) => (c.mis.length ? sum(siteRows(ds, c), (x) => x.backlogOver7) : null),
    targetFn: (ds, c) => Math.round(60 * usersShare(ds, c)),
  },
  {
    id: 'reopen', code: 'SD-22', name: 'Reopened ticket rate', short: 'Reopened', area: 'Service Desk', unit: 'pct', target: 0.05, better: 'down', amber: 0.01,
    definition: 'Resolved tickets reopened within 10 days ÷ resolved tickets.', source: ITSM, owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    compute: (ds, c) => ratio(sum(siteRows(ds, c), (x) => x.reopened), sum(ticketRows(ds, { ...c, pri: [], cat: [] }), (x) => x.resolved)),
  },
  {
    id: 'csat', code: 'SD-23', name: 'User satisfaction (1 to 5)', short: 'User satisfaction', area: 'Service Desk', unit: 'score', digits: 2, target: 4.5, better: 'up', amber: 0.2,
    definition: 'Average closed-ticket survey score (1 to 5); response count reported.', source: 'Survey tool', owner: 'Service Desk Manager', scope: 'site', page: 'service-desk',
    compute: (ds, c) => { const r = siteRows(ds, c); return ratio(sum(r, (x) => x.csatSum), sum(r, (x) => x.csatN)); },
  },
  // ---------------- Clinical systems
  {
    id: 'ehr_avail', code: 'CS-01', name: 'EHR availability (unscheduled downtime only)', short: 'EHR availability', area: 'Clinical Systems', unit: 'pct', digits: 2, target: 0.999, better: 'up', amber: 0.0005,
    definition: 'Scheduled minutes less unscheduled downtime ÷ scheduled minutes for the production EHR.', source: MON, owner: 'Clinical Apps Lead', scope: 'enterprise', page: 'clinical',
    compute: (ds, c) => systemAvailability(ds, c.mis, 0),
  },
  {
    id: 'clin_avail', code: 'CS-02', name: 'Critical clinical systems availability', short: 'Clinical systems', area: 'Clinical Systems', unit: 'pct', digits: 2, target: 0.999, better: 'up', amber: 0.0005,
    definition: 'Same method as EHR, across the agreed P1 clinical system list (excluding the EHR).', source: MON, owner: 'Clinical Apps Lead', scope: 'enterprise', page: 'clinical',
    compute: (ds, c) => availability(ds, c.mis, (s) => s !== 0 && tierOf(ds, s) === 'P1'),
  },
  {
    id: 'clin_below', code: 'CS-03', name: 'Clinical systems below target', short: 'Systems below target', area: 'Clinical Systems', unit: 'count', target: 0, better: 'down', amber: 1,
    definition: 'Clinical systems whose availability missed their tier target (P1 99.9%, general 99.5%).', source: MON, owner: 'Clinical Apps Lead', scope: 'enterprise', page: 'clinical',
    compute: (ds, c) => (c.mis.length ? ds.systems.filter((s) => (systemAvailability(ds, c.mis, s.key) ?? 1) < (s.tier === 'P1' ? 0.999 : 0.995)).length : null),
  },
  {
    id: 'clin_planned', code: 'CS-04', name: 'Planned clinical downtime', short: 'Planned downtime', area: 'Clinical Systems', unit: 'hrs', target: null, better: 'none',
    definition: 'Approved maintenance windows on clinical systems, reported separately.', source: 'Change calendar', owner: 'Clinical Apps Lead', scope: 'enterprise', page: 'clinical',
    compute: (ds, c) => (c.mis.length ? sum(systemRows(ds, c.mis), (r) => r.plannedHrs) : null),
  },
  {
    id: 'interface_errors', code: 'CS-05', name: 'Interface errors', area: 'Clinical Systems', unit: 'count', target: null, better: 'down',
    definition: 'Interface messages failed or rejected between clinical systems.', source: 'Interface engine', owner: 'Integration Lead', scope: 'enterprise', page: 'clinical',
    compute: (ds, c) => (c.mis.length ? sum(systemRows(ds, c.mis), (r) => r.interfaceErrors) : null),
  },
  // ---------------- Infrastructure
  {
    id: 'uptime_p1', code: 'IN-01', name: 'Critical-system uptime, P1 tier', short: 'Critical uptime (P1)', area: 'Infrastructure', unit: 'pct', digits: 2, target: 0.999, better: 'up', amber: 0.0005,
    definition: 'Availability of P1-tier systems combined; P1 and general systems assessed separately.', source: 'Infrastructure monitoring tool', owner: 'Infrastructure Lead', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => availability(ds, c.mis, (s) => tierOf(ds, s) === 'P1'),
  },
  {
    id: 'uptime_gen', code: 'IN-02', name: 'Critical-system uptime, general tier', short: 'Uptime (general)', area: 'Infrastructure', unit: 'pct', digits: 2, target: 0.995, better: 'up', amber: 0.002,
    definition: 'Availability of general-tier systems combined.', source: 'Infrastructure monitoring tool', owner: 'Infrastructure Lead', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => availability(ds, c.mis, (s) => tierOf(ds, s) === 'General'),
  },
  {
    id: 'sched_down', agg: 'sum', code: 'IN-03', name: 'Scheduled downtime (reported separately)', short: 'Scheduled downtime', area: 'Infrastructure', unit: 'hrs', target: null, better: 'none',
    definition: 'Approved maintenance downtime; excluded from target performance.', source: 'Change calendar; monitoring tool', owner: 'Infrastructure Lead', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => infra(ds, c.mi)?.schedHrs ?? null,
  },
  {
    id: 'unsched_down', agg: 'sum', perMonth: true, code: 'IN-04', name: 'Unscheduled downtime (counts against target)', short: 'Unscheduled downtime', area: 'Infrastructure', unit: 'hrs', target: 2, better: 'down', amber: 1,
    definition: 'Unplanned outage duration across infrastructure services; only this downtime counts against target.', source: MON, owner: 'Infrastructure Lead', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => infra(ds, c.mi)?.unschedHrs ?? null,
  },
  {
    id: 'network', code: 'IN-05', name: 'Network availability', short: 'Network', area: 'Infrastructure', unit: 'pct', digits: 2, target: 0.999, better: 'up', amber: 0.0005,
    definition: 'Minutes the core network and site links are up ÷ total minutes.', source: 'Network monitoring tool', owner: 'Network Lead', scope: 'site', page: 'infrastructure',
    compute: (ds, c) => { const r = siteRows(ds, c); return ratio(sum(r, (x) => x.netUpMin), sum(r, (x) => x.netTotMin)); },
  },
  {
    id: 'wan', agg: 'mean', code: 'IN-06', name: 'Internet and WAN availability', short: 'Internet / WAN', area: 'Infrastructure', unit: 'pct', digits: 2, target: 0.999, better: 'up', amber: 0.0005,
    definition: 'Minutes internet and WAN carriers are up ÷ total minutes.', source: 'Network monitoring tool', owner: 'Network Lead', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => infra(ds, c.mi)?.wan ?? null,
  },
  {
    id: 'server', agg: 'mean', code: 'IN-07', name: 'Server and hosting availability', short: 'Servers', area: 'Infrastructure', unit: 'pct', digits: 2, target: 0.999, better: 'up', amber: 0.0005,
    definition: 'Minutes production servers are up ÷ total minutes, excluding approved maintenance.', source: 'Infrastructure monitoring tool', owner: 'Infrastructure Lead', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => infra(ds, c.mi)?.server ?? null,
  },
  {
    id: 'email', agg: 'mean', code: 'IN-08', name: 'Email availability', short: 'Email', area: 'Infrastructure', unit: 'pct', digits: 2, target: 0.999, better: 'up', amber: 0.0005,
    definition: 'Minutes the email service is up for users ÷ total minutes.', source: 'Email admin portal', owner: 'Messaging Lead', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => infra(ds, c.mi)?.email ?? null,
  },
  {
    id: 'backup', agg: 'mean', code: 'IN-09', name: 'Backup success', short: 'Backup success', area: 'Infrastructure', unit: 'pct', digits: 2, target: 1, better: 'up',
    amberText: 'Amber if every failed job re-ran successfully within 24 hours; red otherwise',
    definition: 'Backup jobs completed without error ÷ scheduled jobs; any failure is flagged.', source: 'Backup console', owner: 'Backup Lead', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => { const x = infra(ds, c.mi); return x ? 1 - x.backupFailed / x.backupJobs : null; },
    statusFn: (ds, c, v) => { const xs = c.mis.map((mi) => infra(ds, mi)).filter((x): x is NonNullable<typeof x> => !!x); if (!xs.length || v === null) return 'none'; const failed = sum(xs, (x) => x.backupFailed); if (failed === 0) return 'ok'; return sum(xs, (x) => x.backupRerunOk) >= failed ? 'watch' : 'off'; },
  },
  {
    id: 'patch30', code: 'IN-10', name: 'All patches within 30 days of release', short: 'Patches ≤ 30 days', area: 'Infrastructure', unit: 'pct', target: 0.95, better: 'up', amber: 0.02,
    definition: 'In-scope devices with all approved patches installed within 30 days of release.', source: 'Patch management tool', owner: 'Endpoint Lead', scope: 'site', page: 'infrastructure',
    compute: (ds, c) => { const r = siteRows(ds, c); return ratio(sum(r, (x) => x.patch30), sum(r, (x) => x.patchDevices)); },
  },
  {
    id: 'crit7', code: 'IN-11', name: 'Critical security patches within 7 days', short: 'Critical patches ≤ 7 days', area: 'Infrastructure', unit: 'pct', target: 1, better: 'up', amber: 0.03, amberText: 'Amber within 3 pts',
    definition: 'In-scope devices with critical security patches installed within 7 days.', source: 'Patch management tool', owner: 'Endpoint Lead', scope: 'site', page: 'infrastructure',
    compute: (ds, c) => { const r = siteRows(ds, c); return ratio(sum(r, (x) => x.crit7), sum(r, (x) => x.critDevices)); },
  },
  {
    id: 'storage', agg: 'max', code: 'IN-12', name: 'Storage utilization, peak', short: 'Storage used', area: 'Infrastructure', unit: 'pct', digits: 0, target: 0.8, better: 'down', amber: 0.1, targetText: '≤ 80%', amberText: 'Amber 80%; red 90%',
    definition: 'Peak monthly storage used as percent of capacity.', source: 'Monitoring tools', owner: 'Infrastructure Lead', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => infra(ds, c.mi)?.storagePeak ?? null,
  },
  {
    id: 'bandwidth', agg: 'max', code: 'IN-13', name: 'Internet bandwidth used, peak', short: 'Bandwidth used', area: 'Infrastructure', unit: 'pct', digits: 0, target: 0.8, better: 'down', amber: 0.1, targetText: '≤ 80%', amberText: 'Amber 80%; red 90%',
    definition: 'Peak internet bandwidth as percent of capacity.', source: 'Monitoring tools', owner: 'Network Lead', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => infra(ds, c.mi)?.bandwidthPeak ?? null,
  },
  {
    id: 'hostmem', agg: 'max', code: 'IN-14', name: 'Server host CPU / memory used, peak', short: 'Host CPU / memory', area: 'Infrastructure', unit: 'pct', digits: 0, target: 0.8, better: 'down', amber: 0.1, targetText: '≤ 80%', amberText: 'Amber 80%; red 90%',
    definition: 'Peak host CPU or memory (whichever is higher) as percent of capacity.', source: 'Monitoring tools', owner: 'Infrastructure Lead', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => { const x = infra(ds, c.mi); return x ? Math.max(x.cpuPeak, x.memPeak) : null; },
  },
  {
    id: 'certs60', agg: 'last', code: 'IN-15', name: 'Certificates expiring within 60 days', short: 'Certs ≤ 60 days', area: 'Infrastructure', unit: 'count', target: 0, better: 'down', targetText: 'Flag 60 days; red 14 days', amberText: 'Amber ≤ 60 days; red ≤ 14 days',
    definition: 'In-scope certificates with an expiration date inside 60 days.', source: 'Certificate inventory', owner: 'Infrastructure Lead', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => infra(ds, c.mi)?.certs60 ?? null,
    statusFn: (ds, c) => { const x = infra(ds, c.mis[c.mis.length - 1] ?? c.mi); if (!x) return 'none'; return x.certs14 > 0 ? 'off' : x.certs60 > 0 ? 'watch' : 'ok'; },
  },
  // ---------------- Change
  {
    id: 'chg_total', agg: 'sum', code: 'CH-01', name: 'Changes implemented', short: 'Changes', area: 'Change', unit: 'count', target: null, better: 'none',
    definition: 'Implemented changes, counted as standard, normal and emergency.', source: ITSM, owner: 'Change Manager', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => { const x = infra(ds, c.mi); return x ? x.chgStd + x.chgNormal + x.chgEmerg : null; },
  },
  {
    id: 'chg_success', agg: 'mean', code: 'CH-02', name: 'Change success rate (failed = caused incident)', short: 'Change success', area: 'Change', unit: 'pct', target: 0.98, better: 'up', amber: 0.01,
    definition: 'Changes completed without causing an incident ÷ changes implemented.', source: ITSM, owner: 'Change Manager', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => { const x = infra(ds, c.mi); return x ? 1 - x.chgFailed / (x.chgStd + x.chgNormal + x.chgEmerg) : null; },
  },
  {
    id: 'chg_emerg', agg: 'sum', code: 'CH-03', name: 'Emergency change count', short: 'Emergency changes', area: 'Change', unit: 'count', target: null, better: 'down', amberText: 'Flag an unusual increase',
    definition: 'Emergency changes implemented; a high count signals instability.', source: ITSM, owner: 'Change Manager', scope: 'enterprise', page: 'infrastructure',
    compute: (ds, c) => infra(ds, c.mi)?.chgEmerg ?? null,
    statusFn: (ds, c, v) => spike(ds, c, v, 'chg_emerg', 2),
  },
  // ---------------- Major incidents
  {
    id: 'mi_p1p2', perMonth: true, code: 'MI-01', name: 'P1 and P2 incidents (count)', short: 'P1 + P2 incidents', area: 'Major Incidents', unit: 'count', target: 2, better: 'down', amber: 1, targetText: '≤ 2 per month (scaled to the period)',
    definition: 'Incidents classified P1 or P2 under A3, counted by date opened.', source: ITSM, owner: 'Service Delivery Lead', scope: 'site', page: 'incidents',
    compute: (ds, c) => (c.mis.length ? incidentsIn(ds, c).length : null),
  },
  {
    id: 'mi_p1', code: 'MI-02', name: 'P1 incidents', area: 'Major Incidents', unit: 'count', target: 0, better: 'down', amber: 0,
    definition: 'Incidents classified P1 under A3.', source: ITSM, owner: 'Service Delivery Lead', scope: 'site', page: 'incidents',
    compute: (ds, c) => (c.mis.length ? incidentsIn(ds, c).filter((i) => i.sev === 'P1').length : null),
  },
  {
    id: 'mi_downtime', code: 'MI-03', name: 'Clinical downtime from major incidents', short: 'Clinical downtime', area: 'Major Incidents', unit: 'hrs', target: null, better: 'down',
    definition: 'Hours clinical users worked on downtime procedures because of P1/P2 incidents.', source: 'Incident register', owner: 'Service Delivery Lead', scope: 'site', page: 'incidents',
    compute: (ds, c) => (c.mis.length ? sum(incidentsIn(ds, c), (i) => i.clinicalDowntimeHrs) : null),
  },
  // ---------------- Security
  {
    id: 'sec_incidents', agg: 'sum', code: 'SC-01', name: 'Security incidents', area: 'Security', unit: 'count', target: null, better: 'none',
    definition: 'Security incidents reported, by count, severity and status.', source: 'SIEM; incident register', owner: 'Chief Information Security Officer', scope: 'enterprise', page: 'security',
    compute: (ds, c) => { const s = sec(ds, c.mi); return s ? s.incLow + s.incMed + s.incHigh : null; },
  },
  {
    id: 'phish', agg: 'mean', code: 'SC-02', name: 'Phishing simulation click rate after training', short: 'Phishing click rate', area: 'Security', unit: 'pct', target: 0.05, better: 'down', amber: 0.015,
    definition: 'Users clicking a simulated phishing message after training ÷ delivered simulations.', source: 'Security awareness platform', owner: 'Security Awareness Lead', scope: 'enterprise', page: 'security',
    compute: (ds, c) => { const s = sec(ds, c.mi); return s ? s.phishClicks / s.phishDelivered : null; },
  },
  {
    id: 'vuln_crit', agg: 'last', code: 'SC-03', name: 'Critical vulnerabilities open', short: 'Critical vulns', area: 'Security', unit: 'count', target: null, better: 'down', amberText: 'Flag an unusual increase',
    definition: 'Open scan findings rated Critical at month end. High, medium and low reported alongside.', source: 'Vulnerability scanner', owner: 'Vulnerability Mgmt Lead', scope: 'enterprise', page: 'security',
    compute: (ds, c) => sec(ds, c.mi)?.vulnC ?? null,
    statusFn: (ds, c, v) => spike(ds, c, v, 'vuln_crit', 1.2),
  },
  {
    id: 'mttp', agg: 'mean', code: 'SC-04', name: 'Mean time to patch critical CVEs', short: 'Time to patch critical', area: 'Security', unit: 'days', target: 7, better: 'down', amber: 2, targetText: '< 7 days',
    definition: 'Average days from critical CVE release or detection to patch on in-scope devices.', source: 'Vulnerability scanner; patch tool', owner: 'Vulnerability Mgmt Lead', scope: 'enterprise', page: 'security',
    compute: (ds, c) => sec(ds, c.mi)?.mttpCrit ?? null,
  },
  {
    id: 'endpoint', agg: 'last', code: 'SC-05', name: 'Endpoint protection coverage', short: 'Endpoint coverage', area: 'Security', unit: 'pct', target: 1, better: 'up', amber: 0.005, amberText: 'Amber within 0.5 pts',
    definition: 'In-scope endpoints actively reporting protection ÷ in-scope endpoints.', source: 'Endpoint console; inventory', owner: 'Endpoint Lead', scope: 'enterprise', page: 'security',
    compute: (ds, c) => sec(ds, c.mi)?.endpointCov ?? null,
  },
  {
    id: 'mfa', agg: 'last', code: 'SC-06', name: 'Multifactor sign-in coverage', short: 'MFA coverage', area: 'Security', unit: 'pct', target: 1, better: 'up', amber: 0.03,
    definition: 'Accounts requiring a second sign-in step ÷ in-scope accounts.', source: 'Identity platform', owner: 'Identity Lead', scope: 'enterprise', page: 'security',
    compute: (ds, c) => sec(ds, c.mi)?.mfaCov ?? null,
  },
  {
    id: 'encryption', agg: 'last', code: 'SC-07', name: 'Laptop encryption', area: 'Security', unit: 'pct', target: 1, better: 'up', amber: 0.01,
    definition: 'In-scope laptops encrypted ÷ in-scope laptops.', source: 'Endpoint console', owner: 'Endpoint Lead', scope: 'enterprise', page: 'security',
    compute: (ds, c) => sec(ds, c.mi)?.encryption ?? null,
  },
  {
    id: 'training', agg: 'last', code: 'SC-08', name: 'Security training completion', short: 'Training', area: 'Security', unit: 'pct', target: 0.95, better: 'up', amber: 0.03,
    definition: 'In-scope staff completing annual security training ÷ in-scope staff.', source: 'Learning system; HR list', owner: 'Security Awareness Lead', scope: 'enterprise', page: 'security',
    compute: (ds, c) => sec(ds, c.mi)?.training ?? null,
  },
  {
    id: 'admin_review', agg: 'last', code: 'SC-09', name: 'Admin account review', short: 'Admin review', area: 'Security', unit: 'pct', target: 1, better: 'up', amber: 0.05,
    definition: 'Admin accounts reviewed in the period ÷ admin accounts.', source: 'Identity platform', owner: 'Identity Lead', scope: 'enterprise', page: 'security',
    compute: (ds, c) => sec(ds, c.mi)?.adminReview ?? null,
  },
  {
    id: 'failed_logins', agg: 'sum', code: 'SC-10', name: 'Failed logins', area: 'Security', unit: 'count', target: null, better: 'down', amberText: 'Flag unusual spikes',
    definition: 'Failed login attempts; anomaly indicator. Lockouts reported alongside.', source: 'Identity platform; SIEM', owner: 'Chief Information Security Officer', scope: 'enterprise', page: 'security',
    compute: (ds, c) => sec(ds, c.mi)?.failedLogins ?? null,
    statusFn: (ds, c, v) => spike(ds, c, v, 'failed_logins', 1.3),
  },
  {
    id: 'lockouts', agg: 'sum', code: 'SC-11', name: 'Account lockouts', area: 'Security', unit: 'count', target: null, better: 'down', amberText: 'Flag unusual spikes',
    definition: 'Account lockouts; anomaly indicator.', source: 'Identity platform; SIEM', owner: 'Chief Information Security Officer', scope: 'enterprise', page: 'security',
    compute: (ds, c) => sec(ds, c.mi)?.lockouts ?? null,
    statusFn: (ds, c, v) => spike(ds, c, v, 'lockouts', 1.3),
  },
  {
    id: 'phi', agg: 'sum', code: 'SC-12', name: 'PHI exposure events', area: 'Security', unit: 'count', target: 0, better: 'down', amber: 0, targetText: '0', amberText: 'Any event is red; reported separately',
    definition: 'Confirmed or suspected protected health information exposure events.', source: 'Incident register; privacy office', owner: 'Privacy Officer', scope: 'enterprise', page: 'security',
    compute: (ds, c) => sec(ds, c.mi)?.phiEvents ?? null,
  },
  {
    id: 'patch_exc', agg: 'last', code: 'SC-13', name: 'Patching exceptions logged', short: 'Patch exceptions', area: 'Security', unit: 'count', target: null, better: 'none', amberText: 'Review aging and risk',
    definition: 'Devices that cannot be patched, including medical devices; tracked as exceptions, not misses.', source: 'Patch tool; exception register', owner: 'Vulnerability Mgmt Lead', scope: 'enterprise', page: 'security',
    compute: (ds, c) => sec(ds, c.mi)?.patchExceptions ?? null,
  },
];

export const METRIC_BY_ID: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.id, m]));
export const M = (id: string) => METRIC_BY_ID[id];

/** Scorecard rows: every KPI in the catalog, grouped by area (slides 4 and 5 plus executive and financial). */
export const SCORECARD_IDS = AREAS.flatMap((a) => METRICS.filter((m) => m.area === a).map((m) => m.id));

// ---------------------------------------------------------------- status engine

/** Value of a metric for the context's period, combining months by the metric's agg rule. */
export function periodValue(ds: Dataset, m: MetricDef, c: Ctx): number | null {
  if (!c.mis.length) return null;
  const agg = m.agg ?? 'rows';
  if (agg === 'rows' || c.mis.length === 1) return m.compute(ds, c);
  if (agg === 'last') return m.compute(ds, monthCtx(c, c.mis[c.mis.length - 1]));
  const vals = c.mis.map((mi) => m.compute(ds, monthCtx(c, mi))).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  if (agg === 'sum') return vals.reduce((x, y) => x + y, 0);
  if (agg === 'max') return Math.max(...vals);
  return vals.reduce((x, y) => x + y, 0) / vals.length;
}

/** Flag a spike: more than factor x the average of the previous three periods of the same length. */
function spike(ds: Dataset, c: Ctx, v: number | null, id: string, factor: number): Status {
  if (v === null) return 'none';
  const n = c.mis.length || 1;
  const prev = [1, 2, 3].map((k) => shiftCtx(c, k * n)).filter((x): x is Ctx => !!x).map((x) => periodValue(ds, M(id), x)).filter((x): x is number => x !== null);
  if (!prev.length) return 'none';
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  return v > avg * factor ? 'watch' : 'ok';
}

export function targetOf(ds: Dataset, m: MetricDef, c: Ctx): number | null {
  const t = m.targetFn ? m.targetFn(ds, c) : m.target;
  return t !== null && m.perMonth ? t * Math.max(1, c.mis.length) : t;
}
const amberOf = (ds: Dataset, m: MetricDef, c: Ctx) => (m.amberFn ? m.amberFn(ds, c) : (m.amber ?? 0) * (m.perMonth ? Math.max(1, c.mis.length) : 1));

/** Status from target and amber band only (no trend or repeat-miss rules). */
export function rawStatus(ds: Dataset, m: MetricDef, c: Ctx, value?: number | null): Status {
  const v = value === undefined ? periodValue(ds, m, c) : value;
  if (m.statusFn) return m.statusFn(ds, c, v);
  const t = targetOf(ds, m, c);
  if (v === null || t === null || m.better === 'none') return 'none';
  const gap = m.better === 'up' ? t - v : v - t; // > 0 means missing
  const eps = 1e-9;
  if (gap <= eps) return 'ok';
  return gap <= amberOf(ds, m, c) + eps ? 'watch' : 'off';
}

export function trendLabel(m: MetricDef, cur: number | null, prior: number | null): TrendLabel {
  if (cur === null || prior === null) return '–';
  const base = Math.abs(prior) || 1;
  const d = cur - prior;
  // For availability-style percentages, use the gap to 100% so small moves still register.
  const rel = m.unit === 'pct' && (m.digits ?? 1) >= 2 ? d / Math.max(1 - prior, 0.0005) / 10 : d / base;
  if (Math.abs(rel) <= TREND_THRESHOLD) return 'Stable';
  if (m.better === 'none') return d > 0 ? 'Up' : 'Down';
  return (m.better === 'up') === d > 0 ? 'Favorable' : 'Unfavorable';
}

export interface MetricValue {
  m: MetricDef; value: number | null; target: number | null; status: Status; variance: number | null;
  /** Previous period of the same kind (prior month / quarter; prior year for YTD, year and R12). */
  prior: number | null;
  /** Same months a year earlier. */
  py: number | null; change: number | null; pyChange: number | null;
  /** Trend vs the prior period, and vs 3 months ago (month view) or vs prior year (other views). */
  mom: TrendLabel; m3: TrendLabel; threeAgo: number | null; range3: [number, number] | null;
  monthsMet: number; monthsMeasured: number;
  trend: { mi: number; value: number | null; target: number | null; status: Status }[];
}

const cache = new WeakMap<Dataset, Map<string, MetricValue>>();

export function evaluate(ds: Dataset, id: string, c: Ctx, trendMonths = 13): MetricValue {
  let mc = cache.get(ds);
  if (!mc) { mc = new Map(); cache.set(ds, mc); }
  const key = `${id}|${c.kind}|${c.mis.join(',')}|${c.sites.join(',')}|${c.pri.join(',')}|${c.cat.join(',')}|${trendMonths}`;
  const hit = mc.get(key);
  if (hit) return hit;
  const m = M(id);
  const at = (cc: Ctx | null) => (cc ? periodValue(ds, m, cc) : null);
  const value = at(c);
  const prior = at(shiftCtx(c, priorShift(c.kind)));
  const py = at(shiftCtx(c, 12));
  const threeAgo = c.kind === 'month' ? at(shiftCtx(c, 3)) : py;
  const target = targetOf(ds, m, c);
  let status = rawStatus(ds, m, c, value);
  const m3 = trendLabel(m, value, threeAgo);
  if (!m.statusFn && status !== 'none') {
    // A4: misses target three months in a row -> red (month view).
    if (status === 'watch' && c.kind === 'month') {
      const p1 = shiftCtx(c, 1);
      const p2 = shiftCtx(c, 2);
      const s1 = p1 ? rawStatus(ds, m, p1) : 'none';
      const s2 = p2 ? rawStatus(ds, m, p2) : 'none';
      if (s1 !== 'ok' && s1 !== 'none' && s2 !== 'ok' && s2 !== 'none') status = 'off';
    }
    // A4: meets target with an unfavorable 3-month trend -> amber (when close to target, so noise far
    // from target does not turn a comfortable green amber).
    if (status === 'ok' && c.kind === 'month' && m3 === 'Unfavorable' && target !== null && value !== null) {
      const band = amberOf(ds, m, c) > 0 ? amberOf(ds, m, c) : Math.abs(target) * 0.1;
      if (Math.abs(value - target) <= band) status = 'watch';
    }
  }
  const endC = monthCtx(c, c.mi);
  const range = [1, 2, 3].map((k) => (c.mi - k >= 0 ? m.compute(ds, monthCtx(c, c.mi - k)) : null)).filter((x): x is number => x !== null);
  let met = 0;
  let measured = 0;
  for (let k = 0; k < 12; k++) {
    const mi = c.mi - k;
    if (mi < 0) break;
    const st = rawStatus(ds, m, monthCtx(c, mi));
    if (st !== 'none') { measured++; if (st === 'ok') met++; }
  }
  const trend = [];
  for (let k = trendMonths - 1; k >= 0; k--) {
    const mi = c.mi - k;
    if (mi < 0) continue;
    const cc = monthCtx(endC, mi);
    const v = m.compute(ds, cc);
    trend.push({ mi, value: v, target: targetOf(ds, m, cc), status: rawStatus(ds, m, cc, v) });
  }
  const out: MetricValue = {
    m, value, target, status, variance: value !== null && target !== null ? value - target : null,
    prior, py, change: value !== null && prior !== null ? value - prior : null, pyChange: value !== null && py !== null ? value - py : null,
    mom: trendLabel(m, value, prior), m3, threeAgo,
    range3: range.length ? [Math.min(...range), Math.max(...range)] : null,
    monthsMet: met, monthsMeasured: measured, trend,
  };
  mc.set(key, out);
  return out;
}

export const STATUS_LABEL: Record<Status, string> = { ok: 'Green: meets target', watch: 'Amber: watch', off: 'Red: misses target', none: 'Grey: no target' };
export const STATUS_SHORT: Record<Status, string> = { ok: 'Green', watch: 'Amber', off: 'Red', none: 'No target' };

/** Target as written in the scorecard. */
export function targetText(ds: Dataset, m: MetricDef, c: Ctx, f: (v: number | null) => string): string {
  const t = targetOf(ds, m, c);
  if (m.targetFn && t !== null) return `≤ ${f(t)}`;
  if (m.targetText && !(m.perMonth && c.mis.length > 1)) return m.targetText;
  if (t === null) return 'No target';
  if (m.better === 'down') return `≤ ${f(t)}`;
  if (m.better === 'up' && t < 1) return `≥ ${f(t)}`;
  return f(t);
}

// Workspace shell: header, page tabs, filter pane, canvas header (breadcrumb + applied filters),
// status bar and toasts.

import { useState, type ReactNode } from 'react';
import { PRI_LABEL, type Pri } from '../data/model';
import { scopeServiceLines, scopeSites, useApp, type FilterField, type PageId } from '../state';
import { AREAS, type Area } from '../metrics';
import { DIM_LABEL, dimMembers } from './widgets';
import { makePeriod, miOf, PERIOD_KIND_LABEL, priorName, quartersOf, years, type PeriodKind } from '../periods';
import { Icon } from './icons';

export interface PageMeta { id: PageId; group: string; label: string; title: string; question: string; slides: string; filters: FilterField[] }

export const PAGES: PageMeta[] = [
  { id: 'elt', group: 'Summary', label: 'ELT Summary', title: 'ELT Summary', question: 'How are we doing?', slides: 'ELT view', filters: [] },
  { id: 'executive', group: 'Summary', label: 'MOR Summary', title: 'Executive Summary', question: 'How did IT run this month, and what do leaders need to know or decide?', slides: 'MOR slide 3', filters: [] },
  { id: 'review', group: 'Summary', label: 'Qtr & Year', title: 'Quarter and Year Review', question: 'How did each quarter and month of the year perform against target, and how does the year compare with last year?', slides: 'Board / ELT view', filters: [] },
  { id: 'financial', group: 'Summary', label: 'Financial', title: 'Financial and Value Summary', question: 'What does IT cost, are we on budget, and what did service misses and downtime cost us?', slides: 'CFO view', filters: [] },
  { id: 'scorecard', group: 'Summary', label: 'Scorecard', title: 'Service Scorecard vs Targets', question: 'Which service levels met target this month, and which are trending the wrong way?', slides: 'MOR slides 4-5', filters: [] },
  { id: 'service-desk', group: 'Analytics', label: 'Service Desk', title: 'Service Desk: Demand, Speed and Experience', question: 'Is demand under control, and are users getting fast, good service?', slides: 'MOR slides 6-7', filters: ['pri', 'cat'] },
  { id: 'clinical', group: 'Analytics', label: 'Clinical Apps', title: 'Clinical Applications: EHR and Clinical System Health', question: 'Were the EHR and clinical systems available when clinicians needed them?', slides: 'MOR slide 8', filters: [] },
  { id: 'infrastructure', group: 'Analytics', label: 'Infrastructure', title: 'Infrastructure Health: Stability, Protection and Capacity', question: 'Is the infrastructure stable, protected and sized for what is coming?', slides: 'MOR slide 9', filters: [] },
  { id: 'incidents', group: 'Analytics', label: 'Incidents', title: 'Major Incidents: P1 and P2 Events and Fixes', question: 'What broke, who was affected, and are the fixes on track?', slides: 'MOR slide 10 · A5', filters: [] },
  { id: 'security', group: 'Analytics', label: 'Security', title: 'Security and Compliance: Risk Posture', question: 'How exposed are we, and is protection coverage where it needs to be?', slides: 'MOR slide 11', filters: [] },
  { id: 'sites', group: 'Analytics', label: 'Sites', title: 'Site IT Tear Sheet', question: 'How is IT performing at each site compared with the rest of the system?', slides: 'MOR appendix tear sheet', filters: [] },
  { id: 'projects', group: 'Act', label: 'Projects & Actions', title: 'Projects, Actions and Decisions', question: 'Are projects on track, what are we doing next month, and what do we need decided?', slides: 'MOR slides 12-13', filters: [] },
  { id: 'reference', group: 'Appendix', label: 'Definitions', title: 'Appendix: Contract Service Levels, Definitions and Rules', question: 'What does each measure mean, what did the contract promise, and how is status set?', slides: 'MOR A1-A4', filters: [] },
];
export const PAGE_BY_ID = Object.fromEntries(PAGES.map((p) => [p.id, p])) as Record<PageId, PageMeta>;

export function Header() {
  const { ds, route } = useApp();
  const sc = scopeSites(ds, route);
  const scopeParts = [
    ...route.region.map((k) => ds.regions[k]), ...route.ft.map((k) => ds.facilityTypes[k]),
  ];
  const scope = sc.length === 0 ? `All sites (${ds.sites.length})` : sc[0] === -1 ? 'No sites match' : sc.length === 1 ? ds.sites[sc[0]].name : `${scopeParts.length ? `${scopeParts.join(', ')}: ` : ''}${sc.length} sites`;
  const { period } = useApp();
  return (
    <header className="app-header">
      <div className="brand">
        <span className="logo" aria-hidden="true"><Icon name="chart" size={14} /></span>
        <span className="product">IT Operations Analytics</span>
        <span className="sep" aria-hidden="true" />
        <span className="org">{ds.client} · {scope}</span>
      </div>
      <div className="header-meta">
        <span>Reporting period <b>{period.label}</b><span className={`pill ${period.partial ? 'pill-prelim' : 'pill-closed'}`}>{period.partial ? 'To date' : 'Closed'}</span></span>
        <span className="hide-sm">Data through <b>{period.endMi === ds.currentMi ? ds.dataThrough : ds.months[period.endMi].label}</b></span>
        <span className="fresh-ok hide-sm"><span className="dot" aria-hidden="true" />Refreshed {ds.refreshed}</span>
      </div>
      <div className="header-right">
        <span className="user" title="Mock user">
          <span className="avatar" aria-hidden="true">SD</span>
          <span className="user-name hide-sm">Service Delivery Lead<span className="user-role">Managed IT Services</span></span>
        </span>
      </div>
    </header>
  );
}

export function NavTabs() {
  const { route, go, toast } = useApp();
  let lastGroup = '';
  return (
    <nav className="tabs no-print" aria-label="Dashboard pages">
      <div className="tab-list" role="tablist">
        {PAGES.map((p) => {
          const head = p.group !== lastGroup ? p.group : null;
          lastGroup = p.group;
          return (
            <span key={p.id} className="tab-wrap">
              {head && <span className="tab-group">{head}</span>}
              <button type="button" role="tab" aria-selected={route.page === p.id} className={`tab ${route.page === p.id ? 'on' : ''}`} onClick={() => go(p.id)}>{p.label}</button>
            </span>
          );
        })}
      </div>
      <div className="tab-actions">
        <button type="button" className="icon-btn" title="Copy link to this view" onClick={() => { try { void navigator.clipboard?.writeText(location.href); } catch { /* blocked */ } toast('Link copied. The period and filters are in the link.'); }}><Icon name="share" /></button>
        <button type="button" className="icon-btn" title="Print or save as PDF" onClick={() => window.print()}><Icon name="print" /></button>
      </div>
    </nav>
  );
}

const SLICER_LABEL: Record<FilterField, string> = { ...DIM_LABEL, sites: 'Site', cat: 'Ticket category' };

function Slicer({ field, open: defOpen = false, note }: { field: FilterField; open?: boolean; note?: string }) {
  const { ds, route, toggle, clear } = useApp();
  const [open, setOpen] = useState(defOpen);
  const opts = dimMembers(field, ds, route).map((o) => ({ ...o, label: field === 'sites' ? ds.sites[o.key as number].name : o.label }));
  const chosen = route[field] as (number | Pri)[];
  const name = SLICER_LABEL[field];
  const summary = chosen.length === 0 ? 'All' : chosen.length === 1 ? (opts.find((o) => o.key === chosen[0])?.label ?? '1 selected') : `${chosen.length} selected`;
  return (
    <div className={`slicer ${chosen.length ? 'active' : ''}`}>
      <div className="slicer-head">
        <button type="button" className="slicer-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={10} />
          <span className="slicer-name">{name}</span>
          <span className="slicer-sum" title={summary}>{summary}</span>
        </button>
        {chosen.length > 0 && <button type="button" className="icon-btn xs" title={`Clear ${name}`} onClick={() => clear(field)}><Icon name="close" size={10} /></button>}
      </div>
      {open && (
        <div className="slicer-body">
          {note && <div className="slicer-note">{note}</div>}
          <div className="slicer-actions">
            <button type="button" className="link" onClick={() => clear(field)}>Clear</button>
          </div>
          <div className="slicer-list" role="listbox" aria-multiselectable="true" aria-label={name}>
            {opts.map((o) => (
              <label key={String(o.key)} className={`slicer-opt ${chosen.includes(o.key) ? 'on' : ''}`}>
                <input type="checkbox" checked={chosen.includes(o.key)} onChange={() => toggle(field, o.key)} />
                <span className="opt-label">{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** IT area: limits the KPIs listed in scorecards and definitions (the RCM "RCM area" slicer). */
function AreaSlicer() {
  const { route, set } = useApp();
  const [open, setOpen] = useState(route.areas.length > 0);
  const areas = route.areas;
  const flip = (a: Area) => set({ areas: areas.includes(a) ? areas.filter((x) => x !== a) : [...areas, a] });
  return (
    <div className={`slicer ${areas.length ? 'active' : ''}`}>
      <div className="slicer-head">
        <button type="button" className="slicer-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={10} />
          <span className="slicer-name">IT area</span>
          <span className="slicer-sum">{areas.length === 0 ? 'All' : areas.length === 1 ? areas[0] : `${areas.length} selected`}</span>
        </button>
        {areas.length > 0 && <button type="button" className="icon-btn xs" title="Clear IT area" onClick={() => set({ areas: [] })}><Icon name="close" size={10} /></button>}
      </div>
      {open && (
        <div className="slicer-body">
          <div className="slicer-note">Limits the KPIs listed in the scorecard, the quarter and year review and the definitions.</div>
          <div className="slicer-list">
            {AREAS.map((a) => (
              <label key={a} className={`slicer-opt ${areas.includes(a) ? 'on' : ''}`}>
                <input type="checkbox" checked={areas.includes(a)} onChange={() => flip(a)} />
                <span className="opt-label">{a}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Period picker: view (month, quarter, year to date, full year, rolling 12), then year, then month
 * or quarter. Shared by the filter pane and the Executive Summary.
 */
export function PeriodControls({ layout = 'stack' }: { layout?: 'stack' | 'row' }) {
  const { ds, route, set, period, cmpPeriod } = useApp();
  const ys = years(ds);
  const year = period.year;
  const months = ds.months.filter((m) => m.year === year && m.mi <= ds.currentMi);
  const anchorFor = (y: number, month: number) => { const mi = miOf(ds, y, month); return mi >= 0 && mi <= ds.currentMi ? mi : ds.months.filter((m) => m.year === y && m.mi <= ds.currentMi).slice(-1)[0]?.mi ?? ds.currentMi; };
  const setKind = (pk: PeriodKind) => set({ pk, mi: pk === 'year' ? anchorFor(year, 11) : route.mi });
  const row = layout === 'row';
  const Lbl = ({ children }: { children: string }) => (row ? <span>{children}</span> : <>{children}</>);
  return (
    <div className={row ? 'period-row' : 'period-stack'}>
      <label className={row ? 'elt-slicer' : 'fld'}><Lbl>View</Lbl>
        <select value={route.pk} onChange={(e) => setKind(e.target.value as PeriodKind)} aria-label="Period view">
          {(Object.keys(PERIOD_KIND_LABEL) as PeriodKind[]).map((k) => <option key={k} value={k}>{PERIOD_KIND_LABEL[k]}</option>)}
        </select>
      </label>
      <label className={row ? 'elt-slicer' : 'fld'}><Lbl>Year</Lbl>
        <select value={year} onChange={(e) => set({ mi: anchorFor(Number(e.target.value), route.pk === 'year' ? 11 : ds.months[period.endMi].month) })} aria-label="Year">
          {ys.map((y) => <option key={y} value={y}>{y}{y === ds.months[ds.currentMi].year ? ' (to date)' : ''}</option>)}
        </select>
      </label>
      {route.pk === 'quarter' && (
        <label className={row ? 'elt-slicer' : 'fld'}><Lbl>Quarter</Lbl>
          <select value={period.quarter} onChange={(e) => { const q = Number(e.target.value); set({ mi: anchorFor(year, q * 3 + 2) }); }} aria-label="Quarter">
            {quartersOf(ds, year).map((q) => <option key={q.q} value={q.q}>Q{q.q + 1} {makePeriod(ds, 'quarter', q.mi).partial ? '(to date)' : ''}</option>)}
          </select>
        </label>
      )}
      {(route.pk === 'month' || route.pk === 'ytd' || route.pk === 'r12') && (
        <label className={row ? 'elt-slicer' : 'fld'}><Lbl>{route.pk === 'month' ? 'Month' : 'Through month'}</Lbl>
          <select value={period.endMi} onChange={(e) => set({ mi: Number(e.target.value) })} aria-label="Month">
            {[...months].reverse().map((m) => <option key={m.mi} value={m.mi}>{m.label.split(' ')[0]}</option>)}
          </select>
        </label>
      )}
      <label className={row ? 'elt-slicer' : 'fld'}><Lbl>Compare to</Lbl>
        <select value={route.compare} onChange={(e) => set({ compare: e.target.value as 'prior' | 'py' })} aria-label="Compare to">
          <option value="prior">{route.pk === 'month' ? 'Prior month' : route.pk === 'quarter' ? 'Prior quarter' : 'Prior year'}</option>
          <option value="py">Same period last year</option>
        </select>
      </label>
      {!row && <div className="fld-note">{period.label} vs {cmpPeriod.label}{cmpPeriod.mis.length === 0 ? ' (no data)' : ''}. Data from {ds.months[0].label}.</div>}
    </div>
  );
}

export function FilterPane() {
  const { route, clear, paneOpen, setPaneOpen } = useApp();
  const meta = PAGE_BY_ID[route.page];
  const active = route.region.length + route.ft.length + route.sites.length + route.pt.length + route.sl.length + route.pri.length + route.cat.length + route.areas.length;
  if (!paneOpen) {
    return (
      <aside className="pane pane-closed no-print" aria-label="Filters (collapsed)">
        <button type="button" className="pane-rail" onClick={() => setPaneOpen(true)} title="Show filters">
          <Icon name="filter" /><span className="rail-text">Filters{active ? ` (${active})` : ''}</span>
        </button>
      </aside>
    );
  }
  const enterprisePage = ['clinical', 'security', 'financial', 'projects', 'reference'].includes(meta.id);
  return (
    <aside className="pane no-print" aria-label="Filters">
      <div className="pane-head">
        <span><Icon name="filter" size={13} /> Filters</span>
        <span className="pane-head-actions">
          <button type="button" className="link" disabled={!active} onClick={() => clear()}>Clear all</button>
          <button type="button" className="icon-btn" onClick={() => setPaneOpen(false)} title="Hide filter pane"><Icon name="chevronLeft" /></button>
        </span>
      </div>
      <div className="pane-scroll">
        <section className="pane-sec">
          <h4>Date</h4>
          <PeriodControls />
        </section>
        <section className="pane-sec">
          <h4>Organization</h4>
          <Slicer field="region" />
          <Slicer field="ft" />
          <Slicer field="sites" open={route.page === 'service-desk' || route.sites.length > 0} />
          {enterprisePage && <div className="fld-note">Most measures on this page are enterprise-wide; organization filters apply to site-level measures only.</div>}
        </section>
        <section className="pane-sec pane-na">
          <h4>Payer</h4>
          <div className="fld-note">Not used in IT operations: tickets, outages and IT costs are not billed by payor group or payer. Use Service below to see which clinical areas are affected.</div>
        </section>
        <section className="pane-sec">
          <h4>Service</h4>
          <Slicer field="pt" note="Care setting of the requesting department. Applies to ticket measures." />
          <Slicer field="sl" note="Requesting department's service line. Applies to ticket measures." />
        </section>
        <section className="pane-sec">
          <h4>Metrics</h4>
          <AreaSlicer />
        </section>
        {meta.filters.length > 0 && (
          <section className="pane-sec pane-page">
            <h4>This page</h4>
            {meta.filters.map((f) => <Slicer key={f} field={f} open={(route[f] as unknown[]).length > 0} note="Applies to ticket measures." />)}
          </section>
        )}
        <section className="pane-sec pane-legend">
          <h4>Status rules (A4)</h4>
          <div className="legend-list">
            <span><span className="stcell st-ok"><span className="status-shape" /></span> Green: meets target</span>
            <span><span className="stcell st-watch"><span className="status-shape" /></span> Amber: inside amber band, or meets target with an unfavorable 3-month trend</span>
            <span><span className="stcell st-off"><span className="status-shape" /></span> Red: outside amber band, or missed 3 months in a row</span>
            <span><span className="stcell st-none"><span className="status-shape" /></span> Grey: no target</span>
          </div>
        </section>
      </div>
    </aside>
  );
}

export function CanvasHeader({ title, right, question }: { title?: string; right?: ReactNode; question?: string }) {
  const { route, go, period } = useApp();
  const meta = PAGE_BY_ID[route.page];
  return (
    <div className="canvas-head">
      <div className="canvas-title-row">
        <div>
          <nav className="crumbs" aria-label="Breadcrumb">
            <button type="button" className="crumb" onClick={() => go('executive')}>MOR · {period.label}</button>
            <span className="crumb-sep">›</span><span className="crumb muted-crumb">{meta.group}</span>
            <span className="crumb-sep">›</span><span className="crumb current">{meta.label}</span>
            <span className="crumb-ref">{meta.slides}</span>
          </nav>
          <h1>{title ?? meta.title}</h1>
          <p className="question">{question ?? meta.question}</p>
        </div>
        {right && <div className="canvas-right">{right}</div>}
      </div>
      <AppliedFilters />
    </div>
  );
}

export function AppliedFilters() {
  const { ds, route, toggle, clear, set, period, cmpPeriod } = useApp();
  const label = (f: FilterField, k: number | Pri) => (f === 'pri' ? PRI_LABEL[k as Pri] : dimMembers(f, ds).find((m) => m.key === k)?.label ?? String(k));
  const order: FilterField[] = ['region', 'ft', 'sites', 'pt', 'sl', 'pri', 'cat'];
  const chips = order.flatMap((f) => (route[f] as (number | Pri)[]).map((k) => ({ f, k, label: label(f, k) })));
  const none = scopeSites(ds, route)[0] === -1 || scopeServiceLines(ds, route)[0] === -1;
  return (
    <div className="applied" role="region" aria-label="Applied filters">
      <span className="applied-chip fixed"><span className="chip-field">Period</span> {period.label} <span className="muted">vs {priorName(period, route.compare)} ({cmpPeriod.label})</span></span>
      {chips.map((c) => (
        <span key={`${c.f}-${c.k}`} className="applied-chip">
          <span className="chip-field">{SLICER_LABEL[c.f]}</span>
          <button type="button" className="chip-val" onClick={() => toggle(c.f, c.k)} aria-label={`Remove ${c.label}`}>{c.label} <Icon name="close" size={9} /></button>
        </span>
      ))}
      {route.areas.length > 0 && (
        <span className="applied-chip"><span className="chip-field">IT area</span>
          <span className="chip-val static">{route.areas.join(', ')}</span>
          <button type="button" className="chip-x" aria-label="Clear IT area" onClick={() => set({ areas: [] })}><Icon name="close" size={9} /></button>
        </span>
      )}
      {none && <span className="txt-off small">No sites or service lines match these filters.</span>}
      {chips.length === 0 && route.areas.length === 0 ? <span className="muted small">No filters applied. Click any bar or row to filter; use the pane on the left for more.</span>
        : <button type="button" className="link" onClick={() => clear()}>Clear all</button>}
    </div>
  );
}

export function StatusBar() {
  const { ds } = useApp();
  return (
    <footer className="statusbar no-print">
      <span><Icon name="database" size={11} /> Sources: IT service management, phone system, monitoring, backup console, patch and vulnerability tools, SIEM, project register</span>
      <span>All sources loaded</span>
      <span>Targets: Convene defaults, confirm per contract</span>
      <span className="synthetic">Mock data · {ds.client} and all sites, systems and figures are fictional</span>
    </footer>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className="toast">{t.msg}</div>)}</div>;
}

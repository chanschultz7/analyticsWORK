// Global app state: page, reporting month, comparison and cross-filters. Everything lives in the URL
// hash (#/page?m=17&site=0,1&pri=P2&cat=3) so a link reopens the same view.
//
// Filters mirror the RCM analytics sidebar: Organization (region, facility type, site), Service
// (patient type, service line), Metrics (IT area) and page filters (priority, ticket category).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Dataset, Pri } from './data/model';
import type { Area, Ctx } from './metrics';
import { comparePeriod, makePeriod, type Period, type PeriodKind } from './periods';

export type PageId = 'elt' | 'executive' | 'review' | 'financial' | 'scorecard' | 'service-desk' | 'clinical' | 'infrastructure' | 'incidents' | 'security' | 'sites' | 'projects' | 'reference';
export type Compare = 'prior' | 'py';
export type FilterField = 'region' | 'ft' | 'sites' | 'pt' | 'sl' | 'pri' | 'cat';
export const FILTER_FIELDS: FilterField[] = ['region', 'ft', 'sites', 'pt', 'sl', 'pri', 'cat'];

interface Route {
  page: PageId; mi: number; pk: PeriodKind; compare: Compare;
  region: number[]; ft: number[]; sites: number[]; pt: number[]; sl: number[]; pri: Pri[]; cat: number[];
  areas: Area[]; tab?: string; site?: number;
}

const PAGES: PageId[] = ['elt', 'executive', 'review', 'financial', 'scorecard', 'service-desk', 'clinical', 'infrastructure', 'incidents', 'security', 'sites', 'projects', 'reference'];

function parse(hash: string, ds: Dataset): Route {
  const [path, q = ''] = hash.replace(/^#\/?/, '').split('?');
  const p = new URLSearchParams(q);
  const list = (k: string) => (p.get(k) ? p.get(k)!.split(',').filter(Boolean) : []);
  const mi = Number(p.get('m'));
  return {
    page: (PAGES as string[]).includes(path) ? (path as PageId) : 'elt',
    mi: Number.isInteger(mi) && p.has('m') && mi >= 0 && mi <= ds.currentMi ? mi : ds.currentMi,
    pk: (['month', 'quarter', 'ytd', 'year', 'r12'] as const).find((k) => k === p.get('pk')) ?? 'month',
    compare: p.get('cmp') === 'py' ? 'py' : 'prior',
    region: list('region').map(Number), ft: list('ft').map(Number),
    sites: list('site').map(Number).filter((n) => n >= 0 && n < ds.sites.length),
    pt: list('pt').map(Number), sl: list('sl').map(Number), areas: list('area').map(decodeURIComponent) as Area[],
    pri: list('pri') as Pri[],
    cat: list('cat').map(Number),
    tab: p.get('tab') ?? undefined,
    site: p.has('s') ? Number(p.get('s')) : undefined,
  };
}

function build(r: Route, ds: Dataset): string {
  const p = new URLSearchParams();
  if (r.mi !== ds.currentMi) p.set('m', String(r.mi));
  if (r.pk !== 'month') p.set('pk', r.pk);
  if (r.compare === 'py') p.set('cmp', 'py');
  if (r.region.length) p.set('region', r.region.join(','));
  if (r.ft.length) p.set('ft', r.ft.join(','));
  if (r.sites.length) p.set('site', r.sites.join(','));
  if (r.pt.length) p.set('pt', r.pt.join(','));
  if (r.sl.length) p.set('sl', r.sl.join(','));
  if (r.areas.length) p.set('area', r.areas.join(','));
  if (r.pri.length) p.set('pri', r.pri.join(','));
  if (r.cat.length) p.set('cat', r.cat.join(','));
  if (r.tab) p.set('tab', r.tab);
  if (r.site !== undefined) p.set('s', String(r.site));
  const q = p.toString();
  return `#/${r.page}${q ? `?${q.replace(/%2C/g, ',')}` : ''}`;
}

interface AppValue {
  ds: Dataset;
  route: Route;
  ctx: Ctx;
  /** The reporting period and its comparison period (per the compare setting). */
  period: Period; cmpPeriod: Period;
  go: (page: PageId, extra?: Partial<Route>) => void;
  set: (patch: Partial<Route>) => void;
  toggle: (f: FilterField, v: number | Pri) => void;
  clear: (f?: FilterField) => void;
  paneOpen: boolean; setPaneOpen: (b: boolean) => void;
  toast: (msg: string) => void; toasts: { id: number; msg: string }[];
}

const Ctx_ = createContext<AppValue | null>(null);

export function AppProvider({ ds, children }: { ds: Dataset; children: ReactNode }) {
  const [hash, setHash] = useState(() => location.hash);
  const [paneOpen, setPaneOpen] = useState(() => window.innerWidth > 900);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  useEffect(() => {
    const h = () => setHash(location.hash);
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const route = useMemo(() => parse(hash, ds), [hash, ds]);
  const nav = useCallback((r: Route) => {
    const h = build(r, ds);
    if (h !== location.hash) location.hash = h;
    setHash(h);
  }, [ds]);
  const set = useCallback((patch: Partial<Route>) => nav({ ...route, ...patch }), [nav, route]);
  const go = useCallback((page: PageId, extra: Partial<Route> = {}) => {
    nav({ ...route, tab: undefined, site: undefined, ...extra, page });
    document.querySelector('.canvas')?.scrollTo({ top: 0 });
  }, [nav, route]);
  const toggle = useCallback((f: FilterField, v: number | Pri) => {
    const cur = route[f] as (number | Pri)[];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    nav({ ...route, [f]: next });
  }, [nav, route]);
  const clear = useCallback((f?: FilterField) => nav(f ? { ...route, [f]: [] } : { ...route, region: [], ft: [], sites: [], pt: [], sl: [], pri: [], cat: [], areas: [] }), [nav, route]);
  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const period = useMemo(() => makePeriod(ds, route.pk, route.mi), [ds, route.pk, route.mi]);
  const cmpPeriod = useMemo(() => comparePeriod(ds, period, route.compare), [ds, period, route.compare]);
  const ctx = useMemo<Ctx>(() => makeCtx(ds, { mi: period.endMi, mis: period.mis, kind: period.kind }, route), [ds, period, route]);
  const value: AppValue = { ds, route, ctx, period, cmpPeriod, go, set, toggle, clear, paneOpen, setPaneOpen, toast, toasts };
  return <Ctx_.Provider value={value}>{children}</Ctx_.Provider>;
}

export function useApp() {
  const v = useContext(Ctx_);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

/** End month index of the comparison period. */
export function compareMi(route: Route) { return route.compare === 'py' || route.pk === 'ytd' || route.pk === 'year' || route.pk === 'r12' ? route.mi - 12 : route.pk === 'quarter' ? route.mi - 3 : route.mi - 1; }

/** Sites in scope after region, facility type and site filters ([] = all; [-1] = none match). */
export function scopeSites(ds: Dataset, r: Pick<Route, 'region' | 'ft' | 'sites'>): number[] {
  if (!r.region.length && !r.ft.length) return r.sites;
  const ok = ds.sites.filter((s) => (!r.region.length || r.region.includes(s.region)) && (!r.ft.length || r.ft.includes(s.facilityType)) && (!r.sites.length || r.sites.includes(s.key))).map((s) => s.key);
  return ok.length ? ok : [-1];
}
/** Service lines in scope after patient type and service line filters ([] = all; [-1] = none match). */
export function scopeServiceLines(ds: Dataset, r: Pick<Route, 'pt' | 'sl'>): number[] {
  if (!r.pt.length) return r.sl;
  const ok = ds.serviceLines.filter((s) => r.pt.includes(s.patientType) && (!r.sl.length || r.sl.includes(s.key))).map((s) => s.key);
  return ok.length ? ok : [-1];
}

export type RouteFilters = Pick<Route, FilterField>;

/** Evaluation context for a period and a set of filters (route semantics). */
export function makeCtx(ds: Dataset, p: Pick<Ctx, 'mi' | 'mis' | 'kind'>, r: RouteFilters): Ctx {
  return { mi: p.mi, mis: p.mis, kind: p.kind, sites: scopeSites(ds, r), pri: r.pri, cat: r.cat, svc: scopeServiceLines(ds, r) };
}

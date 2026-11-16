// Reporting periods: a month, a quarter, year to date, a full year or the rolling 12 months.
// A period is a set of month indexes (mis) ending at endMi. Comparisons shift the same months back:
// "prior" = the previous period of the same kind and length, "py" = the same months a year earlier.
// A partial quarter or year (the current one) is compared like for like (same number of months).

import type { Dataset } from './data/model';

export type PeriodKind = 'month' | 'quarter' | 'ytd' | 'year' | 'r12';
export type Compare = 'prior' | 'py';

export const PERIOD_KIND_LABEL: Record<PeriodKind, string> = {
  month: 'Month', quarter: 'Quarter', ytd: 'Year to date', year: 'Full year', r12: 'Rolling 12 months',
};

export interface Period {
  kind: PeriodKind; endMi: number; mis: number[]; year: number; quarter: number;
  label: string; short: string; partial: boolean;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Month index (into ds.months) of a calendar year and month, or -1. */
export function miOf(ds: Dataset, year: number, month: number) {
  return ds.months.findIndex((m) => m.year === year && m.month === month);
}

export function years(ds: Dataset) {
  return [...new Set(ds.months.filter((m) => m.mi <= ds.currentMi).map((m) => m.year))].sort((a, b) => b - a);
}

/** Build a period of a kind anchored at a month (the anchor's year and quarter pick the period). */
export function makePeriod(ds: Dataset, kind: PeriodKind, anchorMi: number): Period {
  const last = ds.currentMi;
  const a = ds.months[Math.max(0, Math.min(anchorMi, last))];
  const y = a.year;
  const q = Math.floor(a.month / 3);
  let months: number[] = [];
  if (kind === 'month') months = [a.mi];
  else if (kind === 'quarter') months = [0, 1, 2].map((k) => miOf(ds, y, q * 3 + k));
  else if (kind === 'ytd') months = Array.from({ length: a.month + 1 }, (_, k) => miOf(ds, y, k));
  else if (kind === 'year') months = Array.from({ length: 12 }, (_, k) => miOf(ds, y, k));
  else months = Array.from({ length: 12 }, (_, k) => a.mi - 11 + k);
  const full = kind === 'quarter' ? 3 : kind === 'year' || kind === 'r12' ? 12 : months.length;
  const mis = months.filter((mi) => mi >= 0 && mi <= last);
  const endMi = mis[mis.length - 1] ?? a.mi;
  const partial = mis.length < full;
  const span = (xs: number[]) => (!xs.length ? '' : xs.length === 1 ? ds.months[xs[0]].label : `${MON[ds.months[xs[0]].month]}–${MON[ds.months[xs[xs.length - 1]].month]} ${ds.months[xs[xs.length - 1]].year}`);
  let label = '';
  let short = '';
  if (kind === 'month') { label = a.label; short = a.short; }
  else if (kind === 'quarter') { label = `Q${q + 1} ${y}${partial ? ` (${span(mis)}, to date)` : ''}`; short = `Q${q + 1} ${String(y).slice(2)}`; }
  else if (kind === 'ytd') { label = `Year to date, ${span(mis)}`; short = `YTD ${String(y).slice(2)}`; }
  else if (kind === 'year') { label = `${y}${partial ? ` (${span(mis)}, to date)` : ' full year'}`; short = `FY ${String(y).slice(2)}`; }
  else { label = `Rolling 12 months to ${a.label}`; short = `R12 ${a.short}`; }
  return { kind, endMi, mis, year: y, quarter: q, label, short, partial };
}

/** The comparison period: same months shifted back (previous period, or a year earlier). */
export function comparePeriod(ds: Dataset, p: Period, cmp: Compare): Period {
  const shift = cmp === 'py' || p.kind === 'ytd' || p.kind === 'year' || p.kind === 'r12' ? 12 : p.kind === 'quarter' ? 3 : 1;
  const mis = p.mis.map((m) => m - shift).filter((m) => m >= 0);
  const endMi = p.endMi - shift;
  const valid = mis.length === p.mis.length && endMi >= 0;
  const base = valid ? makePeriod(ds, p.kind, endMi) : null;
  const label = !valid ? 'n/a' : p.kind === 'month' ? ds.months[endMi].label
    : p.kind === 'quarter' ? `Q${base!.quarter + 1} ${base!.year}${p.partial ? ' (same months)' : ''}`
      : p.kind === 'r12' ? base!.label : `${base!.year}${p.partial || p.kind === 'ytd' ? ` (${MON[ds.months[mis[0]].month]}–${MON[ds.months[mis[mis.length - 1]].month]})` : ''}`;
  const short = !valid ? 'n/a' : p.kind === 'month' ? ds.months[endMi].short : p.kind === 'quarter' ? `Q${base!.quarter + 1} ${String(base!.year).slice(2)}` : p.kind === 'r12' ? `prior R12` : `${p.kind === 'ytd' ? 'YTD' : 'FY'} ${String(base!.year).slice(2)}`;
  return { kind: p.kind, endMi, mis: valid ? mis : [], year: base?.year ?? p.year - 1, quarter: base?.quarter ?? p.quarter, label, short, partial: p.partial };
}

/** What "prior" means for this kind, for labels. */
export function priorName(p: Period, cmp: Compare) {
  if (cmp === 'py' || p.kind === 'ytd' || p.kind === 'year' || p.kind === 'r12') return 'prior year';
  return p.kind === 'quarter' ? 'prior quarter' : 'prior month';
}

/** Quarters of a year that have data, as anchor months. */
export function quartersOf(ds: Dataset, year: number) {
  return [0, 1, 2, 3].map((q) => ({ q, mi: miOf(ds, year, q * 3) })).filter((x) => x.mi >= 0 && x.mi <= ds.currentMi);
}

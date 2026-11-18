// ECharts option builders. Pages pass data, never raw options.
// Series colors are a fixed categorical order; status colors are reserved for status.

import type { EChartsOption } from 'echarts';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#0f7b8a', '#b5651d', '#7a7f87', '#9aa2ae'];
export const PRI_COLORS: Record<string, string> = { P1: '#bb3328', P2: '#eb6834', P3: '#2a78d6', P4: '#86b6ef', SR: '#1baf7a' };
export const COMPARE = '#a9b0bb';
export const STATUS_COLOR = { ok: '#1d7a3a', watch: '#d08a12', off: '#bb3328', none: '#a9b0bb' };
const INK = { primary: '#1b1f24', secondary: '#4b5361', muted: '#7a8291', grid: '#e8eaee', axis: '#c9ced6' };
const FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
const FADED = 0.28;

const base = {
  animation: false,
  textStyle: { fontFamily: FONT, color: INK.secondary, fontSize: 11 },
  grid: { left: 8, right: 18, top: 26, bottom: 6, containLabel: true },
};
const tooltip = {
  backgroundColor: '#fff', borderColor: INK.axis, borderWidth: 1, padding: [6, 8],
  textStyle: { color: INK.primary, fontSize: 11, fontFamily: FONT },
  extraCssText: 'box-shadow: 0 2px 6px rgba(20,30,40,.12); border-radius: 2px;',
};
const allInt = (series: { data: (number | null | undefined)[] | unknown }[]) => series.every((s) => Array.isArray(s.data) && (s.data as unknown[]).every((v) => v === null || v === undefined || Number.isInteger(v)));
const valueAxis = (fmt: (v: number) => string, extra: object = {}) => ({
  type: 'value' as const, axisLabel: { color: INK.muted, fontSize: 10, formatter: (v: number) => fmt(v) },
  splitLine: { lineStyle: { color: INK.grid } }, axisLine: { show: false }, ...extra,
});
const catAxis = (labels: string[], extra: object = {}) => ({
  type: 'category' as const, data: labels, axisLabel: { color: INK.secondary, fontSize: 10 },
  axisLine: { lineStyle: { color: INK.axis } }, axisTick: { show: false }, ...extra,
});
const targetLine = (t: number | null | undefined, fmt: (v: number) => string, axis: 'x' | 'y') => (t === null || t === undefined ? undefined : {
  silent: true, symbol: 'none', lineStyle: { color: INK.secondary, type: 'dashed' as const, width: 1 },
  label: { formatter: `Target ${fmt(t)}`, color: INK.secondary, fontSize: 10, position: axis === 'y' ? ('insideEndTop' as const) : ('start' as const) },
  data: [axis === 'y' ? { yAxis: t } : { xAxis: t }],
});
const legend = (show: boolean) => (show ? { top: 0, left: 0, itemWidth: 10, itemHeight: 8, textStyle: { fontSize: 10.5, color: INK.secondary }, icon: 'rect' } : { show: false });

export interface Series { name: string; data: (number | null)[]; color?: string; type?: 'bar' | 'line'; dashed?: boolean; stack?: boolean }

/** Bar chart (horizontal or column). Selected indexes stay solid, others fade (cross-filter feedback). */
export function barOption(o: {
  labels: string[]; series: Series[]; fmt: (v: number) => string; horizontal?: boolean; target?: number | null;
  selected?: number[]; stacked?: boolean; labelsOn?: boolean; colorBy?: (i: number) => string | undefined; min?: number; max?: number;
}): EChartsOption {
  const sel = new Set(o.selected ?? []);
  const multi = o.series.length > 1;
  const showLabels = o.labelsOn ?? (!multi && !o.stacked);
  const series = o.series.map((s, si) => ({
    name: s.name, type: 'bar' as const, stack: o.stacked ? 'all' : undefined, barMaxWidth: o.horizontal ? 16 : 26,
    data: s.data.map((v, i) => ({ value: v, itemStyle: { color: o.colorBy?.(i) ?? s.color ?? SERIES[si], opacity: sel.size && !sel.has(i) ? FADED : 1, borderRadius: o.stacked ? 0 : o.horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0] } })),
    label: showLabels && (!multi || si === o.series.length - 1) ? { show: true, position: o.horizontal ? ('right' as const) : ('top' as const), fontSize: 10, color: INK.secondary, formatter: (p: { value: number }) => (p.value === null ? '' : o.fmt(p.value)) } : undefined,
    markLine: si === o.series.length - 1 ? targetLine(o.target, o.fmt, o.horizontal ? 'x' : 'y') : undefined,
    emphasis: { focus: 'none' as const },
  }));
  const vAxis = valueAxis(o.fmt, { min: o.min, max: o.max, minInterval: allInt(o.series) ? 1 : undefined, splitNumber: o.horizontal ? 3 : undefined });
  const cAxis = catAxis(o.labels, o.horizontal ? { inverse: true, axisLabel: { color: INK.secondary, fontSize: 10.5, width: 150, overflow: 'truncate' } } : { axisLabel: { color: INK.secondary, fontSize: 10, interval: 0 } });
  return {
    ...base, grid: { ...base.grid, top: multi ? 26 : 12, right: o.horizontal ? 54 : 18 },
    legend: legend(multi), tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => (v === null || v === undefined ? '–' : o.fmt(Number(v))) },
    xAxis: o.horizontal ? vAxis : cAxis, yAxis: o.horizontal ? cAxis : vAxis, series,
  } as EChartsOption;
}

/** Line chart with optional target line or per-month target series and a highlighted month. */
export function lineOption(o: { labels: string[]; series: Series[]; fmt: (v: number) => string; target?: number | null | (number | null)[]; selectedIndex?: number; min?: number; max?: number; area?: boolean }): EChartsOption {
  const targetSeries = Array.isArray(o.target);
  const series: object[] = o.series.map((s, si) => ({
    name: s.name, type: s.type ?? 'line', stack: s.stack ? 'all' : undefined, data: s.data, connectNulls: false, smooth: false,
    symbol: 'circle', symbolSize: si === 0 ? 5 : 3, showSymbol: si === 0,
    lineStyle: { width: si === 0 ? 2 : 1.5, color: s.color ?? SERIES[si], type: s.dashed ? 'dashed' : 'solid' },
    itemStyle: { color: s.color ?? SERIES[si] },
    areaStyle: o.area && si === 0 ? { color: 'rgba(42,120,214,0.08)' } : undefined,
    barMaxWidth: 22,
    markLine: si === 0 && !targetSeries ? targetLine(o.target as number | null, o.fmt, 'y') : undefined,
    markArea: si === 0 && o.selectedIndex !== undefined ? { silent: true, itemStyle: { color: 'rgba(42,120,214,0.07)' }, data: [[{ xAxis: o.labels[o.selectedIndex] }, { xAxis: o.labels[o.selectedIndex] }]] } : undefined,
  }));
  if (targetSeries) series.push({ name: 'Target', type: 'line', step: 'middle', data: o.target, symbol: 'none', lineStyle: { color: INK.secondary, type: 'dashed', width: 1 }, itemStyle: { color: INK.secondary } });
  return {
    ...base, grid: { ...base.grid, top: 28 },
    legend: legend(series.length > 1),
    tooltip: { ...tooltip, trigger: 'axis', valueFormatter: (v) => (v === null || v === undefined ? '–' : o.fmt(Number(v))) },
    xAxis: catAxis(o.labels, { boundaryGap: o.series.some((s) => s.type === 'bar') }),
    yAxis: valueAxis(o.fmt, { min: o.min ?? (o.series.some((x) => x.type === 'bar') ? 0 : undefined), max: o.max, scale: o.min === undefined && !o.series.some((x) => x.type === 'bar'), minInterval: allInt(o.series) ? 1 : undefined }),
    series,
  } as EChartsOption;
}

/** Stacked columns by month (e.g. tickets by priority), optional line overlay. */
export function stackedOption(o: { labels: string[]; series: Series[]; fmt: (v: number) => string; line?: Series; selectedSeries?: string[]; horizontal?: boolean }): EChartsOption {
  const sel = new Set(o.selectedSeries ?? []);
  const series: object[] = o.series.map((s, si) => ({
    name: s.name, type: 'bar', stack: 'all', data: s.data, barMaxWidth: o.horizontal ? 18 : 28,
    itemStyle: { color: s.color ?? SERIES[si], opacity: sel.size && !sel.has(s.name) ? FADED : 1 },
    emphasis: { focus: 'series' },
  }));
  if (o.line) series.push({ name: o.line.name, type: 'line', data: o.line.data, symbol: 'circle', symbolSize: 5, lineStyle: { color: '#1b1f24', width: 1.5 }, itemStyle: { color: '#1b1f24' }, z: 5 });
  const v = valueAxis(o.fmt, { minInterval: allInt(o.series) ? 1 : undefined });
  const c = catAxis(o.labels, o.horizontal ? { inverse: true, axisLabel: { color: INK.secondary, fontSize: 10.5, width: 150, overflow: 'truncate' } } : {});
  return {
    ...base, grid: { ...base.grid, top: series.length > 5 ? 52 : 30 }, legend: legend(true),
    tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (x) => (x === null || x === undefined ? '–' : o.fmt(Number(x))) },
    xAxis: o.horizontal ? v : c, yAxis: o.horizontal ? c : v, series,
  } as EChartsOption;
}

// ---------------------------------------------------------------- ELT Summary charts

/** Round to a step sized to the data range (not the magnitude), so 99.6%-100% stays readable. */
const stepOf = (range: number) => 10 ** Math.floor(Math.log10(range || 1) - 0.5);
const niceFloor = (v: number, range: number) => Math.floor(v / stepOf(range)) * stepOf(range);
const niceCeil = (v: number, range: number) => Math.ceil(v / stepOf(range)) * stepOf(range);

/** ELT trend card: actual line, dashed target and a faint off-target range (as in RCM analytics). */
export function eltTrendOption(o: { labels: string[]; values: (number | null)[]; target: number | null; fmt: (v: number) => string; direction: 'up' | 'down' | 'none'; bars?: boolean }): EChartsOption {
  const vals = o.values.filter((v): v is number => v != null);
  const lo = Math.min(...vals, o.target ?? Infinity);
  const hi = Math.max(...vals, o.target ?? -Infinity);
  const pad = (hi - lo) * 0.18 || Math.abs(hi) * 0.05 || 1;
  const range = hi - lo + 2 * pad;
  const min = o.bars ? 0 : niceFloor(lo - pad, range);
  // Availability-style percentages cannot exceed 100%.
  const max = hi <= 1 && lo >= 0 && o.direction === 'up' && hi > 0.9 ? Math.min(1, niceCeil(hi + pad, range)) : niceCeil(hi + pad, range);
  const last = o.values.length - 1;
  const missZone = o.target === null || o.direction === 'none' ? undefined : {
    silent: true, itemStyle: { color: 'rgba(187,51,40,0.06)' },
    data: [[{ yAxis: o.direction === 'down' ? o.target : min }, { yAxis: o.direction === 'down' ? max : o.target }]],
  };
  return {
    ...base,
    grid: { left: 4, right: 14, top: 12, bottom: 4, containLabel: true },
    tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: INK.axis } }, valueFormatter: (v) => (v == null ? '–' : o.fmt(v as number)) },
    xAxis: catAxis(o.labels, { boundaryGap: !!o.bars, axisLabel: { color: INK.muted, fontSize: 10, interval: (i: number) => i === 0 || i === last || i === Math.floor(last / 2) } }),
    yAxis: { ...valueAxis(o.fmt, { min, max, splitNumber: 3, minInterval: o.bars ? 1 : undefined }), splitLine: { lineStyle: { color: '#f0f2f5' } } },
    series: [{
      name: 'Actual', type: o.bars ? 'bar' : 'line', data: o.values, barMaxWidth: 14, smooth: false, showSymbol: false, symbol: 'circle', symbolSize: 8,
      lineStyle: { width: 2, color: SERIES[0] }, itemStyle: { color: SERIES[0], borderColor: o.bars ? undefined : '#fff', borderWidth: o.bars ? 0 : 2 },
      areaStyle: o.bars ? undefined : { color: 'rgba(42,120,214,0.06)' },
      markLine: o.target === null ? undefined : { silent: true, symbol: 'none', lineStyle: { color: INK.secondary, type: 'dashed', width: 1 }, label: { show: false }, data: [{ yAxis: o.target }] },
      markArea: missZone,
    }],
  } as EChartsOption;
}

export interface UnitAxis { name: string; fmt: (v: number) => string }
export interface TrendLine { name: string; data: (number | null)[]; color: string; axis: 0 | 1; target?: (number | null)[] }

/** ELT selected-metric trend: one line per metric in a fixed color, dashed targets, two units at most. */
export function multiTrendOption(o: { labels: string[]; lines: TrendLine[]; axes: UnitAxis[]; showTargets: boolean }): EChartsOption {
  const fmtOf = (axis: number) => o.axes[axis]?.fmt ?? String;
  const series = o.lines.flatMap((l) => [
    { name: l.name, type: 'line' as const, yAxisIndex: l.axis, data: l.data, showSymbol: o.labels.length <= 14, symbol: 'circle', symbolSize: 7,
      lineStyle: { width: 2, color: l.color }, itemStyle: { color: l.color, borderColor: '#fff', borderWidth: 2 },
      tooltip: { valueFormatter: (v: unknown) => (v == null ? '–' : fmtOf(l.axis)(v as number)) } },
    ...(o.showTargets && l.target?.some((t) => t !== null) ? [{
      name: `${l.name} target`, type: 'line' as const, yAxisIndex: l.axis, data: l.target, showSymbol: false, silent: true,
      lineStyle: { width: 1, type: 'dashed' as const, color: l.color, opacity: 0.7 }, itemStyle: { color: l.color },
      tooltip: { valueFormatter: (v: unknown) => (v == null ? '–' : fmtOf(l.axis)(v as number)) } }] : []),
  ]);
  return {
    ...base,
    grid: { left: 8, right: 8, top: 52, bottom: 4, containLabel: true },
    legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 3, textStyle: { color: INK.secondary, fontSize: 11 }, data: o.lines.map((l) => l.name) },
    tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: INK.axis } } },
    xAxis: catAxis(o.labels, { boundaryGap: false }),
    yAxis: o.axes.map((a, i) => valueAxis(a.fmt, { name: a.name, nameTextStyle: { color: INK.muted, fontSize: 10, align: i === 0 ? 'left' : 'right' }, scale: true, position: i === 0 ? 'left' : 'right', ...(i === 1 ? { splitLine: { show: false } } : {}) })),
    series,
  } as EChartsOption;
}

import { useMemo } from 'react';

import './ChartsRow.css';
import EChart, { type ChartClick } from './EChart.tsx';
import { ERA_YEAR } from '../lib/constants.ts';
import { CHART_COLORS, baseOption } from '../lib/echartsTheme.ts';
import { fmtCount, fmtGbp } from '../lib/format.ts';
import { useStore } from '../store.ts';
import { TX_TYPES, type TxType } from '../types.ts';

const AXIS = {
  axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
  axisLabel: { color: CHART_COLORS.dim, fontSize: 10 },
  splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
};

const AGE_BUCKETS = ['18–25', '26–35', '36–45', '46–55', '56–65', '66+'];
const AGE_RANGES: [number, number][] = [[0, 25], [26, 35], [36, 45], [46, 55], [56, 65], [66, 200]];

export default function ChartsRow() {
  const result = useStore((s) => s.result);
  const openTxList = useStore((s) => s.openTxList);
  const openUserList = useStore((s) => s.openUserList);

  const typeEntries = useMemo(
    () => (result ? TX_TYPES.filter((t) => result.totals.byType[t] > 0) : []),
    [result],
  );

  const typeOption = useMemo(() => {
    if (!result) return {};
    return {
      ...baseOption(),
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: fmtCount } },
      yAxis: { type: 'category', data: typeEntries.map((t) => t.replaceAll('_', ' ').toLowerCase()), ...AXIS, splitLine: { show: false } },
      series: [{ type: 'bar', data: typeEntries.map((t) => result.totals.byType[t]), itemStyle: { color: CHART_COLORS.accent, borderRadius: [0, 4, 4, 0] }, barMaxWidth: 18 }],
    };
  }, [result, typeEntries]);

  // Histogram bins plus the GBP range each covers, so a click maps to a filter.
  const hist = useMemo(() => {
    if (!result) return null;
    const all: number[] = [];
    for (const samples of Object.values(result.amountSamples)) all.push(...samples);
    all.sort((a, b) => a - b);
    const bins = 40;
    const zeroBucket = result.totals.nonPositiveAmounts;
    const labels: string[] = [];
    const counts: number[] = [];
    const ranges: [number, number][] = [];
    if (zeroBucket > 0) ranges.push([-1e15, 1e-9]);
    if (all.length > 10) {
      const lo = Math.log10(Math.max(0.01, all[0]));
      const hi = Math.log10(all[all.length - 1]);
      const step = (hi - lo) / bins || 1;
      counts.length = 0;
      counts.push(...new Array(bins).fill(0));
      for (const v of all) counts[Math.min(bins - 1, Math.floor((Math.log10(v) - lo) / step))] += 1;
      for (let i = 0; i < bins; i++) {
        labels.push(fmtGbp(10 ** (lo + (i + 0.5) * step)));
        ranges.push([10 ** (lo + i * step), 10 ** (lo + (i + 1) * step)]);
      }
    }
    return { labels, counts, zeroBucket, ranges };
  }, [result]);

  const histOption = useMemo(() => {
    if (!hist) return {};
    return {
      ...baseOption(),
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: [...(hist.zeroBucket > 0 ? ['≤ £0'] : []), ...hist.labels], ...AXIS, axisLabel: { ...AXIS.axisLabel, interval: 7 }, splitLine: { show: false } },
      yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: fmtCount } },
      series: [{ type: 'bar', data: [...(hist.zeroBucket > 0 ? [{ value: hist.zeroBucket, itemStyle: { color: CHART_COLORS.dim } }] : []), ...hist.counts], itemStyle: { color: CHART_COLORS.accent }, barCategoryGap: '20%' }],
    };
  }, [hist]);

  const kycOption = useMemo(() => {
    if (!result || !result.totals.hasKyc) return null;
    const counts = new Map<string, number>();
    for (const u of result.users.values()) counts.set(u.kyc ?? 'UNKNOWN', (counts.get(u.kyc ?? 'UNKNOWN') ?? 0) + 1);
    const palette: Record<string, string> = { PASSED: CHART_COLORS.accent, PENDING: CHART_COLORS.warn, NONE: CHART_COLORS.dim, FAILED: CHART_COLORS.danger };
    return {
      ...baseOption(),
      legend: { bottom: 0, textStyle: { color: CHART_COLORS.dim, fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
      series: [{ type: 'pie', radius: ['52%', '76%'], center: ['50%', '44%'], label: { show: false }, itemStyle: { borderColor: '#151A23', borderWidth: 2 }, data: [...counts.entries()].map(([k, v]) => ({ name: k, value: v, itemStyle: { color: palette[k] ?? CHART_COLORS.surface2 } })) }],
    };
  }, [result]);

  const ageOption = useMemo(() => {
    if (!result || !result.totals.hasBirthYear) return null;
    const counts = new Array(AGE_BUCKETS.length).fill(0);
    for (const u of result.users.values()) {
      if (u.birthYear === null) continue;
      const age = ERA_YEAR - u.birthYear;
      counts[AGE_RANGES.findIndex(([lo, hi]) => age >= lo && age <= hi)] += 1;
    }
    return {
      ...baseOption(),
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: AGE_BUCKETS, ...AXIS, splitLine: { show: false } },
      yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: fmtCount } },
      series: [{ type: 'bar', data: counts, itemStyle: { color: CHART_COLORS.accent, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 }],
    };
  }, [result]);

  if (!result) return null;

  const onType = (c: ChartClick) => {
    const t = typeEntries[c.dataIndex] as TxType | undefined;
    if (t) openTxList({ kind: 'type', txType: t }, `${t.replaceAll('_', ' ').toLowerCase()} transactions`);
  };
  const onHist = (c: ChartClick) => {
    const r = hist?.ranges[c.dataIndex];
    if (r) openTxList({ kind: 'amount', min: r[0], max: r[1], label: c.name }, `Amount bin ${c.name}`);
  };
  const onKyc = (c: ChartClick) => {
    const status = c.name;
    const ids: string[] = [];
    for (const u of result.users.values()) if ((u.kyc ?? 'UNKNOWN') === status) ids.push(u.userId);
    openUserList(ids, `KYC ${status}`);
  };
  const onAge = (c: ChartClick) => {
    const [lo, hi] = AGE_RANGES[c.dataIndex];
    const ids: string[] = [];
    for (const u of result.users.values()) {
      if (u.birthYear === null) continue;
      const age = ERA_YEAR - u.birthYear;
      if (age >= lo && age <= hi) ids.push(u.userId);
    }
    openUserList(ids, `Age ${AGE_BUCKETS[c.dataIndex]}`);
  };

  return (
    <div className="charts-row">
      <div className="card chart-card">
        <div className="card-title">Transactions by type <span className="chart-hint">· click a bar</span></div>
        <EChart option={typeOption} style={{ height: 200 }} onClick={onType} />
      </div>
      <div className="card chart-card">
        <div className="card-title">Amount distribution (GBP, log bins) <span className="chart-hint">· click a bar</span></div>
        <EChart option={histOption} style={{ height: 200 }} onClick={onHist} />
      </div>
      <div className="card chart-card">
        <div className="card-title">Users by KYC status <span className="chart-hint">· click a slice</span></div>
        {kycOption ? <EChart option={kycOption} style={{ height: 200 }} onClick={onKyc} /> : <div className="chart-empty muted">KYC not provided in this dataset</div>}
      </div>
      <div className="card chart-card">
        <div className="card-title">Users by age (as of {ERA_YEAR}) <span className="chart-hint">· click a bar</span></div>
        {ageOption ? <EChart option={ageOption} style={{ height: 200 }} onClick={onAge} /> : <div className="chart-empty muted">Birth year not provided in this dataset</div>}
      </div>
    </div>
  );
}

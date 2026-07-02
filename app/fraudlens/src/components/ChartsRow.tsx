import { useMemo } from 'react';

import './ChartsRow.css';
import EChart from './EChart.tsx';
import { ERA_YEAR } from '../lib/constants.ts';
import { CHART_COLORS, baseOption } from '../lib/echartsTheme.ts';
import { fmtCount, fmtGbp } from '../lib/format.ts';
import { useStore } from '../store.ts';
import { TX_TYPES } from '../types.ts';

const AXIS = {
  axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
  axisLabel: { color: CHART_COLORS.dim, fontSize: 10 },
  splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
};

export default function ChartsRow() {
  const result = useStore((s) => s.result);

  const typeOption = useMemo(() => {
    if (!result) return {};
    const entries = TX_TYPES.filter((t) => result.totals.byType[t] > 0);
    return {
      ...baseOption(),
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: fmtCount } },
      yAxis: {
        type: 'category',
        data: entries.map((t) => t.replaceAll('_', ' ').toLowerCase()),
        ...AXIS,
        splitLine: { show: false },
      },
      series: [{
        type: 'bar',
        data: entries.map((t) => result.totals.byType[t]),
        itemStyle: { color: CHART_COLORS.accent, borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 18,
      }],
    };
  }, [result]);

  const histOption = useMemo(() => {
    if (!result) return {};
    const all: number[] = [];
    for (const samples of Object.values(result.amountSamples)) all.push(...samples);
    all.sort((a, b) => a - b);
    const bins = 40;
    let labels: string[] = [];
    let counts: number[] = [];
    if (all.length > 10) {
      const lo = Math.log10(Math.max(0.01, all[0]));
      const hi = Math.log10(all[all.length - 1]);
      const step = (hi - lo) / bins || 1;
      counts = new Array(bins).fill(0);
      for (const v of all) {
        const i = Math.min(bins - 1, Math.floor((Math.log10(v) - lo) / step));
        counts[i] += 1;
      }
      labels = Array.from({ length: bins }, (_, i) => fmtGbp(10 ** (lo + (i + 0.5) * step)));
    }
    const zeroBucket = result.totals.nonPositiveAmounts;
    return {
      ...baseOption(),
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: [...(zeroBucket > 0 ? ['≤ £0'] : []), ...labels],
        ...AXIS,
        axisLabel: { ...AXIS.axisLabel, interval: 7 },
        splitLine: { show: false },
      },
      yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: fmtCount } },
      series: [{
        type: 'bar',
        data: [
          ...(zeroBucket > 0 ? [{ value: zeroBucket, itemStyle: { color: CHART_COLORS.dim } }] : []),
          ...counts,
        ],
        itemStyle: { color: CHART_COLORS.accent },
        barCategoryGap: '20%',
      }],
    };
  }, [result]);

  const kycOption = useMemo(() => {
    if (!result || !result.totals.hasKyc) return null;
    const counts = new Map<string, number>();
    for (const u of result.users.values()) {
      const k = u.kyc ?? 'UNKNOWN';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const palette: Record<string, string> = {
      PASSED: CHART_COLORS.accent,
      PENDING: CHART_COLORS.warn,
      NONE: CHART_COLORS.dim,
      FAILED: CHART_COLORS.danger,
    };
    return {
      ...baseOption(),
      legend: {
        bottom: 0,
        textStyle: { color: CHART_COLORS.dim, fontSize: 10 },
        itemWidth: 10,
        itemHeight: 10,
      },
      series: [{
        type: 'pie',
        radius: ['52%', '76%'],
        center: ['50%', '44%'],
        label: { show: false },
        itemStyle: { borderColor: '#151A23', borderWidth: 2 },
        data: [...counts.entries()].map(([k, v]) => ({
          name: k,
          value: v,
          itemStyle: { color: palette[k] ?? CHART_COLORS.surface2 },
        })),
      }],
    };
  }, [result]);

  const ageOption = useMemo(() => {
    if (!result || !result.totals.hasBirthYear) return null;
    const buckets = ['18–25', '26–35', '36–45', '46–55', '56–65', '66+'];
    const counts = new Array(buckets.length).fill(0);
    for (const u of result.users.values()) {
      if (u.birthYear === null) continue;
      const age = ERA_YEAR - u.birthYear;
      const i = age <= 25 ? 0 : age <= 35 ? 1 : age <= 45 ? 2 : age <= 55 ? 3 : age <= 65 ? 4 : 5;
      counts[i] += 1;
    }
    return {
      ...baseOption(),
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: buckets, ...AXIS, splitLine: { show: false } },
      yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: fmtCount } },
      series: [{
        type: 'bar',
        data: counts,
        itemStyle: { color: CHART_COLORS.accent, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 28,
      }],
    };
  }, [result]);

  if (!result) return null;

  return (
    <div className="charts-row">
      <div className="card chart-card">
        <div className="card-title">Transactions by type</div>
        <EChart option={typeOption} style={{ height: 200 }} />
      </div>
      <div className="card chart-card">
        <div className="card-title">Amount distribution (GBP, log bins)</div>
        <EChart option={histOption} style={{ height: 200 }} />
      </div>
      <div className="card chart-card">
        <div className="card-title">Users by KYC status</div>
        {kycOption ? (
          <EChart option={kycOption} style={{ height: 200 }} />
        ) : (
          <div className="chart-empty muted">KYC not provided in this dataset</div>
        )}
      </div>
      <div className="card chart-card">
        <div className="card-title">Users by age (as of {ERA_YEAR})</div>
        {ageOption ? (
          <EChart option={ageOption} style={{ height: 200 }} />
        ) : (
          <div className="chart-empty muted">Birth year not provided in this dataset</div>
        )}
      </div>
    </div>
  );
}

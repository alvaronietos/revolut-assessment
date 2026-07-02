import { Fragment, useMemo } from 'react';

import './InsightsPanel.css';
import EChart from './EChart.tsx';
import { getDerived } from '../lib/derived.ts';
import { CHART_COLORS, baseOption } from '../lib/echartsTheme.ts';
import { fmtCount, fmtGbp, fmtPct } from '../lib/format.ts';
import { coverage, inOutPoints, ruleCoOccurrence, topCorridors } from '../lib/insights.ts';
import { useStore } from '../store.ts';
import { RULE_IDS } from '../types.ts';

const RULE_SHORT: Record<string, string> = {
  MULE: 'Mule',
  CARD_TESTER: 'Card',
  EXOTIC_CORRIDOR: 'Spread',
  AMOUNT_OUTLIER: 'Outlier',
  KYC_ANOMALY: 'KYC',
  CONCENTRATION: 'Corr.',
};

const AXIS = {
  axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
  axisLabel: { color: CHART_COLORS.dim, fontSize: 10 },
  splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
};

export default function InsightsPanel() {
  const result = useStore((s) => s.result);
  const ruleConfig = useStore((s) => s.ruleConfig);
  const openUser = useStore((s) => s.openUser);

  const data = useMemo(() => {
    if (!result) return null;
    const derived = getDerived(result, ruleConfig);
    const flagged = new Set(derived.rules.flags.keys());
    return {
      corridors: topCorridors(result),
      points: inOutPoints(result.users, flagged),
      matrix: ruleCoOccurrence(derived.rules.flags),
      cover: coverage(result.users, flagged, derived.flaggedExposureGbp),
      hasLabels: result.totals.hasLabels,
    };
  }, [result, ruleConfig]);

  const inOutOption = useMemo(() => {
    if (!data) return {};
    const clean = data.points.filter((p) => !p.flagged).map((p) => [Math.max(1, p.moneyIn), Math.max(1, p.moneyOut), p.userId]);
    const flag = data.points.filter((p) => p.flagged).map((p) => [Math.max(1, p.moneyIn), Math.max(1, p.moneyOut), p.userId]);
    return {
      ...baseOption(),
      grid: { left: 8, right: 12, top: 10, bottom: 8, containLabel: true },
      tooltip: {
        ...baseOption().tooltip,
        formatter: (p: { value: [number, number, string] }) =>
          `${p.value[2].slice(0, 8)}…<br/>In ${fmtGbp(p.value[0])}<br/>Out ${fmtGbp(p.value[1])}`,
      },
      xAxis: { type: 'log', name: 'money in', nameGap: 18, nameTextStyle: { color: CHART_COLORS.dim, fontSize: 10 }, ...AXIS },
      yAxis: { type: 'log', name: 'cash / transfer out', nameTextStyle: { color: CHART_COLORS.dim, fontSize: 10 }, ...AXIS },
      series: [
        { type: 'scatter', symbolSize: 4, itemStyle: { color: CHART_COLORS.accent, opacity: 0.25 }, data: clean },
        { type: 'scatter', symbolSize: 5, itemStyle: { color: CHART_COLORS.danger, opacity: 0.7 }, data: flag },
      ],
    };
  }, [data]);

  if (!result || !data) return null;
  const maxCorridorTx = Math.max(1, ...data.corridors.map((c) => c.txCount));
  const maxCell = Math.max(1, ...data.matrix.map((row, i) => Math.max(...row.map((v, j) => (i === j ? 0 : v)))));
  const cover = data.cover;

  return (
    <div className="card insights">
      <div className="insights-grid">
        {/* A — corridor flows */}
        <div className="insights-cell">
          <div className="card-title">Top corridors (residence → merchant)</div>
          {data.corridors.length === 0 && <div className="muted">No corridors above the size floor.</div>}
          {data.corridors.map((c) => (
            <div key={`${c.res}>${c.mer}`} className="corridor-row">
              <span className="corridor-label">
                {c.res} <span className="muted">→</span> {c.mer}
              </span>
              <div className="corridor-bar">
                <div className="corridor-fill" style={{ width: `${(c.txCount / maxCorridorTx) * 100}%` }} />
              </div>
              <span className="num corridor-tx">{fmtCount(c.txCount)}</span>
              {data.hasLabels && (
                <span className={`num corridor-rate ${c.fraudRate > 0.2 ? 'hot' : ''}`}>{fmtPct(c.fraudRate, 0)}</span>
              )}
            </div>
          ))}
        </div>

        {/* B — money in vs out */}
        <div className="insights-cell">
          <div className="card-title">Money in vs cash-out (mule signature) <span className="chart-hint">· click a point</span></div>
          <EChart
            option={inOutOption}
            style={{ height: 180 }}
            onClick={(c) => {
              const id = Array.isArray(c.value) ? (c.value as unknown[])[2] : undefined;
              if (typeof id === 'string') openUser(id);
            }}
          />
          <div className="muted insights-note">
            Red = flagged. Accounts high on both axes move funds straight back out.
          </div>
        </div>

        {/* C — rule co-occurrence */}
        <div className="insights-cell">
          <div className="card-title">Which rules fire together</div>
          <div className="matrix" style={{ gridTemplateColumns: `48px repeat(${RULE_IDS.length}, 1fr)` }}>
            <div />
            {RULE_IDS.map((r) => (
              <div key={`h${r}`} className="matrix-head">{RULE_SHORT[r]}</div>
            ))}
            {RULE_IDS.map((rowId, i) => (
              <Fragment key={rowId}>
                <div className="matrix-head matrix-rowhead">{RULE_SHORT[rowId]}</div>
                {RULE_IDS.map((colId, j) => {
                  const v = data.matrix[i][j];
                  const diag = i === j;
                  const alpha = diag ? 0 : Math.min(0.85, v / maxCell);
                  return (
                    <div
                      key={`${i}-${j}`}
                      className={`matrix-cell ${diag ? 'matrix-diag' : ''}`}
                      style={diag ? undefined : { background: `rgba(255,77,94,${alpha})` }}
                      title={`${RULE_SHORT[rowId]} + ${RULE_SHORT[colId]}: ${v}`}
                    >
                      {v > 0 ? fmtCount(v) : ''}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>

        {/* D — coverage by exposure */}
        <div className="insights-cell">
          <div className="card-title">Detection coverage</div>
          <div className="coverage-headline">
            <span className="num">{fmtPct(cover.flaggedUserShare, 1)}</span> of users flagged carry{' '}
            <span className="num hot">{fmtPct(cover.flaggedExposureShare, 0)}</span> of the exposure
          </div>
          <div className="coverage-bar">
            <div className="coverage-flagged" style={{ width: `${cover.flaggedExposureShare * 100}%` }} />
          </div>
          <div className="coverage-legend muted">
            <span><span className="dot dot-flagged" /> Flagged {fmtGbp(cover.flaggedExposure)}</span>
            <span><span className="dot dot-rest" /> Rest {fmtGbp(cover.totalExposure - cover.flaggedExposure)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

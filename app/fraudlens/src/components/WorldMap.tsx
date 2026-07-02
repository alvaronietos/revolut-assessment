import { useMemo } from 'react';

import './WorldMap.css';
import EChart from './EChart.tsx';
import { getDerived } from '../lib/derived.ts';
import { CHART_COLORS, COUNTRY_CENTROIDS, baseOption } from '../lib/echartsTheme.ts';
import { fmtCount, fmtGbp, fmtPct } from '../lib/format.ts';
import { countryName } from '../lib/countries.ts';
import { useStore, type Lens, type MapMetric } from '../store.ts';
import type { AggregateResult, RuleConfig } from '../types.ts';

interface MapDatum {
  name: string;
  value: number;
}

function buildSeries(
  result: AggregateResult,
  ruleConfig: RuleConfig,
  lens: Lens,
  metric: MapMetric,
): MapDatum[] {
  const derived = getDerived(result, ruleConfig);
  const countries = lens === 'residence' ? result.residenceCountries : result.merchantCountries;
  const hasLabels = result.totals.hasLabels;

  // Suspicious activity per country: labelled fraud when available, otherwise
  // the flagged users' transactions.
  const suspiciousTx = new Map<string, number>();
  const exposure = new Map<string, number>();
  if (hasLabels) {
    for (const [iso2, agg] of countries) suspiciousTx.set(iso2, agg.fraudTxCount);
  }
  for (const userId of derived.rules.flags.keys()) {
    const user = result.users.get(userId);
    if (!user) continue;
    if (!hasLabels) {
      if (lens === 'residence') {
        suspiciousTx.set(user.residence, (suspiciousTx.get(user.residence) ?? 0) + user.txCount);
      } else {
        for (const [iso2, n] of Object.entries(user.merchantCountries)) {
          suspiciousTx.set(iso2, (suspiciousTx.get(iso2) ?? 0) + n);
        }
      }
    }
    if (lens === 'residence') {
      exposure.set(user.residence, (exposure.get(user.residence) ?? 0) + user.sumGbp);
    }
  }

  const data: MapDatum[] = [];
  for (const [iso2, agg] of countries) {
    let value = 0;
    if (metric === 'count') value = suspiciousTx.get(iso2) ?? 0;
    else if (metric === 'rate') value = agg.txCount > 0 ? (suspiciousTx.get(iso2) ?? 0) / agg.txCount : 0;
    else value = exposure.get(iso2) ?? 0;
    data.push({ name: iso2, value });
  }
  return data;
}

export default function WorldMap() {
  const result = useStore((s) => s.result);
  const ruleConfig = useStore((s) => s.ruleConfig);
  const lens = useStore((s) => s.lens);
  const metric = useStore((s) => s.metric);
  const setLens = useStore((s) => s.setLens);
  const setMetric = useStore((s) => s.setMetric);
  const openDrawer = useStore((s) => s.openDrawer);
  const focusCountry = useStore((s) => s.focusCountry);
  const mapFocus = useStore((s) => s.mapFocus);
  const hasLabels = result?.totals.hasLabels ?? false;
  const hasMerchant = result?.totals.hasMerchant ?? false;

  const word = hasLabels ? 'fraud' : 'flagged';
  const metricLabels: Record<MapMetric, string> = {
    count: `${word} transactions`,
    rate: `${word} rate`,
    exposure: 'flagged exposure (GBP)',
  };

  const option = useMemo(() => {
    if (!result) return {};
    const data = buildSeries(result, ruleConfig, lens, metric);
    const max = Math.max(1e-9, ...data.map((d) => d.value));
    return {
      ...baseOption(),
      tooltip: {
        ...baseOption().tooltip,
        formatter: (p: { name: string; value: number | undefined }) => {
          const v = typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : 0;
          const shown = metric === 'rate' ? fmtPct(v) : metric === 'exposure' ? fmtGbp(v) : fmtCount(v);
          return `<strong>${countryName(p.name)}</strong><br/>${metricLabels[metric]}: ${shown}`;
        },
      },
      visualMap: {
        min: 0,
        max,
        calculable: false,
        orient: 'horizontal',
        left: 8,
        bottom: 4,
        itemWidth: 10,
        itemHeight: 90,
        textStyle: { color: CHART_COLORS.dim, fontSize: 10 },
        inRange: { color: CHART_COLORS.ramp },
        formatter: (v: number) =>
          metric === 'rate' ? fmtPct(v, 0) : metric === 'exposure' ? fmtGbp(v) : fmtCount(v),
      },
      series: [
        {
          type: 'map',
          map: 'world',
          nameProperty: 'ISO_A2_EH',
          roam: true,
          scaleLimit: { min: 0.8, max: 12 },
          center: mapFocus && COUNTRY_CENTROIDS[mapFocus] ? COUNTRY_CENTROIDS[mapFocus] : undefined,
          zoom: mapFocus && COUNTRY_CENTROIDS[mapFocus] ? 5 : 1,
          selectedMode: false,
          itemStyle: {
            areaColor: '#151A23',
            borderColor: 'rgba(255,255,255,0.10)',
            borderWidth: 0.5,
          },
          emphasis: {
            label: { show: false },
            itemStyle: { areaColor: '#4F7CFF' },
          },
          label: { show: false },
          data,
        },
      ],
    };
  }, [result, ruleConfig, lens, metric, mapFocus]);

  // Countries that have data in the current lens, for the jump-to dropdown.
  const countryOptions = useMemo(() => {
    if (!result) return [] as { iso2: string; name: string }[];
    const src = lens === 'residence' ? result.residenceCountries : result.merchantCountries;
    return [...src.keys()]
      .filter((iso2) => COUNTRY_CENTROIDS[iso2])
      .map((iso2) => ({ iso2, name: countryName(iso2) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [result, lens]);

  if (!result) return null;

  return (
    <div className="card worldmap">
      <div className="worldmap-head">
        <div className="card-title">Where the risk sits</div>
        <div className="worldmap-controls">
          <div className="seg">
            <button
              className={lens === 'residence' ? 'seg-on' : ''}
              onClick={() => setLens('residence')}
            >
              Residence
            </button>
            <button
              className={lens === 'merchant' ? 'seg-on' : ''}
              disabled={!hasMerchant}
              title={hasMerchant ? 'Where the money went' : 'No merchant-country column mapped'}
              onClick={() => setLens('merchant')}
            >
              Merchant
            </button>
          </div>
          <select
            className="worldmap-metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as MapMetric)}
          >
            <option value="count">{metricLabels.count}</option>
            <option value="rate">{metricLabels.rate}</option>
            <option value="exposure" disabled={lens === 'merchant'}>
              {metricLabels.exposure}
            </option>
          </select>
          <select
            className="worldmap-metric"
            value={mapFocus ?? ''}
            onChange={(e) => focusCountry(e.target.value || null)}
          >
            <option value="">Jump to country…</option>
            {countryOptions.map((c) => (
              <option key={c.iso2} value={c.iso2}>{c.name}</option>
            ))}
          </select>
          {mapFocus && (
            <button className="btn worldmap-reset" onClick={() => focusCountry(null)}>Reset</button>
          )}
        </div>
      </div>
      <EChart option={option} style={{ height: 380 }} onClick={(p) => openDrawer(p.name)} />
      {result.totals.merchantValues > 0 && result.totals.unparsedMerchant > 0 && (
        <div className="muted worldmap-note num">
          {fmtPct(result.totals.unparsedMerchant / result.totals.merchantValues)} of merchant
          countries unparseable
        </div>
      )}
    </div>
  );
}

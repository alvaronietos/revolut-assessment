// One place registers the tree-shaken ECharts pieces, the world map and the
// shared dark styling every chart starts from.

import { BarChart, MapChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

import worldGeo from '../assets/world.geo.json';

echarts.use([
  CanvasRenderer,
  BarChart,
  PieChart,
  MapChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  TitleComponent,
]);

// The Natural Earth file has no lowercase `name` property; every map series
// must set nameProperty: 'ISO_A2_EH' so data keys are plain ISO2 codes.
echarts.registerMap('world', worldGeo as never);

// Rough [lng, lat] centre per ISO2, from each feature's bounding box. Used to
// centre the map when a country is picked from the dropdown.
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = (() => {
  const out: Record<string, [number, number]> = {};
  const geo = worldGeo as { features: { properties: Record<string, unknown>; geometry: { coordinates: unknown } }[] };
  const walk = (coords: unknown, bbox: number[]) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const x = coords[0];
      const y = coords[1];
      bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y);
      bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y);
      return;
    }
    for (const c of coords) walk(c, bbox);
  };
  for (const f of geo.features) {
    const iso = f.properties.ISO_A2_EH as string;
    if (!iso || iso === '-99') continue;
    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    walk(f.geometry.coordinates, bbox);
    if (bbox[0] !== Infinity) out[iso] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  }
  return out;
})();

export const CHART_COLORS = {
  accent: '#4F7CFF',
  danger: '#FF4D5E',
  warn: '#FFB020',
  ok: '#2DD4A7',
  text: '#F4F6FB',
  dim: '#8B93A7',
  border: 'rgba(255,255,255,0.08)',
  surface2: '#1C2330',
  ramp: ['#16203A', '#24407F', '#3E63D0', '#6E93FF'],
};

export const FONT = "'Inter Variable', -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Baseline option fragments merged into every chart. */
export function baseOption() {
  return {
    textStyle: { fontFamily: FONT, color: CHART_COLORS.dim },
    tooltip: {
      backgroundColor: '#1C2330',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: CHART_COLORS.text, fontSize: 12, fontFamily: FONT },
    },
  };
}

export { echarts };

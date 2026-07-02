// One place registers the tree-shaken ECharts pieces, the world map and the
// shared dark styling every chart starts from.

import { BarChart, MapChart, PieChart } from 'echarts/charts';
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
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  TitleComponent,
]);

// The Natural Earth file has no lowercase `name` property; every map series
// must set nameProperty: 'ISO_A2_EH' so data keys are plain ISO2 codes.
echarts.registerMap('world', worldGeo as never);

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

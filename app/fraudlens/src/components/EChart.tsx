import { useEffect, useRef } from 'react';

import { echarts } from '../lib/echartsTheme.ts';
import type { EChartsType } from 'echarts/core';

interface Props {
  option: Record<string, unknown>;
  onClick?: (params: { name: string }) => void;
  style?: React.CSSProperties;
}

/** Thin ECharts wrapper: init once, notMerge updates, one ResizeObserver. */
export default function EChart({ option, onClick, style }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    const el = ref.current!;
    const chart = echarts.init(el);
    chartRef.current = chart;
    chart.on('click', (params) => clickRef.current?.(params as { name: string }));
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} style={{ width: '100%', height: 280, ...style }} />;
}

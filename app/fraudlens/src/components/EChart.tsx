import { useEffect, useRef } from 'react';

import { echarts } from '../lib/echartsTheme.ts';
import type { EChartsType } from 'echarts/core';

export interface ChartClick {
  name: string;
  dataIndex: number;
  seriesIndex: number;
  value: unknown;
}

interface Props {
  option: Record<string, unknown>;
  onClick?: (params: ChartClick) => void;
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
    chart.on('click', (p) =>
      clickRef.current?.({
        name: (p as { name: string }).name,
        dataIndex: (p as { dataIndex: number }).dataIndex,
        seriesIndex: (p as { seriesIndex: number }).seriesIndex,
        value: (p as { value: unknown }).value,
      }),
    );
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

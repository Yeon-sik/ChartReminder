import {
  createChart,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { ChartPoint } from "./viewModel";

export interface ChartLine {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly lineStyle?: "solid" | "dashed";
  readonly points: readonly ChartPoint[];
}

export interface LineSeriesChartProps {
  readonly lines: readonly ChartLine[];
  /** 차트 대체 텍스트. 스크린 리더는 캔버스 내용을 읽지 못한다 (docs/06 §7). */
  readonly ariaLabel: string;
  readonly height?: number;
}

/**
 * Lightweight Charts v5 다중 라인 래퍼. (공식 React 튜토리얼 패턴)
 *
 * 차트 생성/해제는 마운트 시 1회, 시리즈 데이터 갱신은 `lines` 변경 시마다 별도 effect로 분리한다.
 * `lines`는 항상 리플레이 커서까지만 잘린 포인트를 받는다 — 이 컴포넌트는 자르지 않는다(R6는
 * viewModel.ts의 책임).
 */
export function LineSeriesChart({ lines, ariaLabel, height = 240 }: LineSeriesChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    // Lightweight Charts는 캔버스에 직접 그려 CSS 변수를 상속받지 못한다 —
    // OS 다크모드 여부를 한 번 확인해 텍스트·격자 색을 정한다.
    const isDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const chart = createChart(container, {
      height,
      width: container.clientWidth,
      layout: {
        textColor: isDark ? "#9aa0a6" : "#5b6169",
        background: { color: "transparent" },
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: isDark ? "rgba(154, 160, 166, 0.15)" : "rgba(91, 97, 105, 0.15)" },
      },
      timeScale: { borderVisible: false },
      rightPriceScale: { borderVisible: false },
    });
    chartRef.current = chart;
    seriesRef.current = new Map();

    const handleResize = (): void => {
      chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = new Map();
    };
  }, [height]);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart === null) {
      return;
    }
    const series = seriesRef.current;
    const staleIds = new Set(series.keys());

    for (const line of lines) {
      let lineSeries = series.get(line.id);
      if (lineSeries === undefined) {
        lineSeries = chart.addSeries(LineSeries, {
          color: line.color,
          lineStyle: line.lineStyle === "dashed" ? LineStyle.Dashed : LineStyle.Solid,
          title: line.label,
        });
        series.set(line.id, lineSeries);
      }
      lineSeries.setData(
        line.points.map((point): LineData => ({ time: point.time as Time, value: point.value })),
      );
      staleIds.delete(line.id);
    }

    for (const staleId of staleIds) {
      const lineSeries = series.get(staleId);
      if (lineSeries !== undefined) {
        chart.removeSeries(lineSeries);
        series.delete(staleId);
      }
    }
  }, [lines]);

  return (
    <div className="chart-frame">
      <div ref={containerRef} role="img" aria-label={ariaLabel} />
    </div>
  );
}

import { ASSET_COLORS } from "./PriceChart";
import { LineSeriesChart, type ChartLine } from "./LineSeriesChart";
import type { PortfolioSeries } from "./viewModel";

export interface PortfolioChartProps {
  readonly series: readonly PortfolioSeries[];
}

/** 자산별 기여 원금(점선)·평가액(실선) 두 라인. (docs/06 §4 하단 차트) */
export function PortfolioChart({ series }: PortfolioChartProps) {
  const lines: ChartLine[] = series.flatMap((asset, index) => {
    const color = ASSET_COLORS[index % ASSET_COLORS.length];
    return [
      {
        id: `${asset.instrumentId}-contributed`,
        label: `${asset.label} · 기여 원금`,
        color,
        lineStyle: "dashed" as const,
        points: asset.contributedCapital,
      },
      {
        id: `${asset.instrumentId}-total`,
        label: `${asset.label} · 평가액`,
        color,
        lineStyle: "solid" as const,
        points: asset.totalValue,
      },
    ];
  });

  return <LineSeriesChart lines={lines} ariaLabel="투자금 변화 차트" />;
}

import type { DisplayCurrency } from "../../domain/shared/fxConversion";
import { ASSET_COLORS } from "./PriceChart";
import { LineSeriesChart, type ChartLine } from "./LineSeriesChart";
import type { PortfolioSeries } from "./viewModel";

export interface PortfolioChartProps {
  readonly series: PortfolioSeries;
  /** 라인 라벨과 축 눈금에 표시할 평가액 단위(표시 통화, D-020). */
  readonly displayCurrency: DisplayCurrency;
}

/** 원장 인장·먹줄과 겹치지 않는 중립 잉크색 — 통합 기여 원금 한 선 전용. */
const CONTRIBUTED_CAPITAL_COLOR = "#8a8578";

/**
 * 기여 원금(통합, 점선 1개)·자산별 평가액(실선) 라인. (docs/06 §4 하단 차트)
 *
 * 기여 원금은 통합 투자 설정(D-020)상 자산 간 동일하므로 `viewModel.buildPortfolioSeries`가
 * 이미 하나로 합쳐 반환한다 — 여기서는 그대로 한 선만 그린다.
 */
export function PortfolioChart({ series, displayCurrency }: PortfolioChartProps) {
  const lines: ChartLine[] = [
    {
      id: "contributed-capital",
      label: `기여 원금 (${displayCurrency})`,
      color: CONTRIBUTED_CAPITAL_COLOR,
      lineStyle: "dashed",
      points: series.contributedCapital,
    },
    ...series.assets.map((asset, index) => ({
      id: `${asset.instrumentId}-total`,
      label: `${asset.label} · 평가액 (${displayCurrency})`,
      color: ASSET_COLORS[index % ASSET_COLORS.length],
      lineStyle: "solid" as const,
      points: asset.totalValue,
    })),
  ];

  return <LineSeriesChart lines={lines} ariaLabel="투자금 변화 차트" valueUnit={displayCurrency} />;
}

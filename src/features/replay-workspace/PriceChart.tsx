import { LineSeriesChart, type ChartLine } from "./LineSeriesChart";
import type { AssetPriceSeries } from "./viewModel";

/**
 * 자산별 라인 색상 — 원장 인장의 앰버, 먹줄의 스틸블루. 라이트·다크 배경 모두에서
 * 읽히도록 중간 명도로 고정했다(캔버스 렌더라 CSS 변수를 상속받지 못한다).
 * 색상만으로 구분하지 않도록 solid/dashed도 함께 쓴다 (docs/06 §7).
 */
export const ASSET_COLORS: readonly string[] = ["#c08a2e", "#3e7cb1"];

export interface PriceChartProps {
  readonly series: readonly AssetPriceSeries[];
}

export function PriceChart({ series }: PriceChartProps) {
  const lines: ChartLine[] = series.map((asset, index) => ({
    id: asset.instrumentId,
    label: asset.label,
    color: ASSET_COLORS[index % ASSET_COLORS.length],
    lineStyle: index === 0 ? "solid" : "dashed",
    points: asset.points,
  }));

  return <LineSeriesChart lines={lines} ariaLabel="자산 가격 차트" />;
}

import { formatMoney } from "./format";
import { LineSeriesChart, type ChartLine } from "./LineSeriesChart";
import type { AssetPriceSeries } from "./viewModel";

/**
 * 자산별 라인 색상 — 원장 인장의 앰버, 먹줄의 스틸블루, 세 번째 자산은 이끼녹.
 * 라이트·다크 배경 모두에서 읽히도록 중간 명도로 고정했다(캔버스 렌더라 CSS 변수를
 * 상속받지 못한다). 색상만으로 구분하지 않도록 solid/dashed/dotted도 함께 쓴다 (docs/06 §7).
 */
export const ASSET_COLORS: readonly string[] = ["#c08a2e", "#3e7cb1", "#5f8a4f"];

const ASSET_LINE_STYLES: readonly ("solid" | "dashed" | "dotted")[] = ["solid", "dashed", "dotted"];

export interface PriceChartProps {
  readonly series: readonly AssetPriceSeries[];
}

export function PriceChart({ series }: PriceChartProps) {
  const lines: ChartLine[] = series.map((asset, index) => ({
    id: asset.instrumentId,
    label: asset.label,
    color: ASSET_COLORS[index % ASSET_COLORS.length],
    lineStyle: ASSET_LINE_STYLES[index % ASSET_LINE_STYLES.length],
    points: asset.points,
  }));

  return (
    <div>
      {/* 차트 라인 자체는 상대적 변화 추이만 그린다 — 실제 가격 감각은 여기서 텍스트로 보완한다
          (docs/00 "비교의 의미", docs/06 §4). */}
      <ul className="price-chart__current-prices">
        {series.map((asset, index) => (
          <li key={asset.instrumentId}>
            <span
              className={`price-chart__swatch is-${ASSET_LINE_STYLES[index % ASSET_LINE_STYLES.length]}`}
              style={{ borderColor: ASSET_COLORS[index % ASSET_COLORS.length] }}
              aria-hidden="true"
            />
            <span className="price-chart__label">{asset.label}</span>
            <span className="price-chart__value">
              {asset.currentPrice === null
                ? "데이터 없음"
                : `${formatMoney(asset.currentPrice)}${
                    asset.currentPriceDate !== null ? ` · ${asset.currentPriceDate} 기준` : ""
                  }`}
            </span>
          </li>
        ))}
      </ul>
      <LineSeriesChart lines={lines} ariaLabel="자산 가격변화 차트" />
    </div>
  );
}

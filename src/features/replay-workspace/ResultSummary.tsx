import type { AssetDataNotice } from "../../application/use-cases/prepareReplaySession";
import { parseDecimal, type DecimalString } from "../../domain/shared/decimal";
import { formatDataNotice, formatMoney, formatPercent, formatPriceStatus } from "./format";
import type { ResultSummaryRow } from "./viewModel";

export interface ResultSummaryProps {
  readonly rows: readonly ResultSummaryRow[];
  readonly dataNoticesByInstrumentId: Readonly<Record<string, AssetDataNotice>>;
}

type Sign = "gain" | "loss" | "flat";

function signOf(value: DecimalString): Sign {
  const parsed = parseDecimal(value);
  if (parsed.isZero()) {
    return "flat";
  }
  return parsed.isPositive() ? "gain" : "loss";
}

/** 손익류 수치는 색과 글리프를 함께 쓴다 — 색만으로 의미를 전달하지 않는다 (ui.md). */
function SignedFigure({
  value,
  format,
  emphasize = false,
}: {
  value: DecimalString;
  format: (v: DecimalString) => string;
  emphasize?: boolean;
}) {
  const sign = signOf(value);
  const glyph = sign === "gain" ? "▲" : sign === "loss" ? "▼" : "•";
  const classNames = [
    emphasize ? "result-summary__headline-figure" : undefined,
    sign === "flat" ? undefined : `is-${sign}`,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <dd className={classNames || undefined}>
      {glyph} {format(value)}
    </dd>
  );
}

/** 원금·평가액·손익·수익률·MDD·데이터 상태와 계산 가정. (docs/06 §2, docs/05 §2) */
export function ResultSummary({ rows, dataNoticesByInstrumentId }: ResultSummaryProps) {
  return (
    <div className="result-summary">
      {rows.map((row) => {
        const notice = dataNoticesByInstrumentId[row.instrumentId];
        const noticeText = notice === undefined ? null : formatDataNotice(notice);
        const isFinal = row.finalMetrics !== null;

        return (
          <section key={row.instrumentId} className="result-summary__asset" aria-label={row.label}>
            <header className="result-summary__head">
              <h3>{row.label}</h3>
              <span
                className={`result-summary__status-badge is-${row.priceStatus}`}
                aria-label={`데이터 상태: ${formatPriceStatus(row.priceStatus)}`}
                title={formatPriceStatus(row.priceStatus)}
              >
                {row.priceStatus === "fresh" ? "해당일 종가" : "이월 종가"}
              </span>
            </header>
            <p className="result-summary__date">
              {row.date} 기준{isFinal ? " · 재생 완료" : ""}
            </p>

            {noticeText !== null && <p className="result-summary__notice">{noticeText}</p>}

            {/* 가장 먼저 확인하는 두 수치를 크게 보여준다 — 손익 → 수익률 순 (docs/06 §2). */}
            <dl className="result-summary__headline">
              <div>
                <dt>손익</dt>
                <SignedFigure
                  value={row.profitLoss.amount}
                  format={() => formatMoney(row.profitLoss)}
                  emphasize
                />
              </div>
              <div>
                <dt>{row.assumptions.returnRateLabel}</dt>
                <SignedFigure value={row.returnRate} format={formatPercent} emphasize />
              </div>
            </dl>

            {/* dt/dd를 div로 감싸지 않고 dl의 직속 자식으로 둔다 — 그래야 그리드가 항목마다
                한 행(라벨 열|값 열)으로 배치된다. div로 감싸면 항목 두 개가 한 행에 나란히
                배치돼(자동 배치) 긴 MDD 라벨이 반 칸 너비로 눌려 글자 단위로 줄바꿈된다. */}
            <dl className="result-summary__details">
              <dt>기여 원금</dt>
              <dd>{formatMoney(row.contributedCapital)}</dd>

              <dt>평가금액(총자산)</dt>
              <dd>{formatMoney(row.totalValue)}</dd>

              <dt className="result-summary__sub-row">└ 현금</dt>
              <dd className="result-summary__sub-row">{formatMoney(row.cash)}</dd>

              <dt className="result-summary__sub-row">└ 투자 자산 평가액</dt>
              <dd className="result-summary__sub-row">{formatMoney(row.marketValue)}</dd>

              <dt>{row.assumptions.maxDrawdownTotalValueLabel} · 현재까지</dt>
              <dd>{formatPercent(row.drawdownRateToDate)}</dd>

              {row.finalMetrics !== null && (
                <>
                  <dt>{row.assumptions.maxDrawdownTotalValueLabel} · 구간 전체 최고</dt>
                  <dd>{formatPercent(row.finalMetrics.maxDrawdownTotalValue)}</dd>

                  <dt>{row.assumptions.maxDrawdownPriceLabel}</dt>
                  <dd>{formatPercent(row.finalMetrics.maxDrawdownPrice)}</dd>
                </>
              )}
            </dl>

            <p className="result-summary__assumptions">
              가정: 종가 체결, 수수료 {formatPercent(row.assumptions.feeRate)}, 소수점 매수{" "}
              {row.assumptions.allowFractionalQuantity ? "허용" : "비허용"}, 배당{" "}
              {row.assumptions.dividendPolicy === "adjusted-price" ? "수정주가 반영" : "미반영"},
              세금·슬리피지 미포함
            </p>
          </section>
        );
      })}
    </div>
  );
}

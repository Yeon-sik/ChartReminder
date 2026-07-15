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
}: {
  value: DecimalString;
  format: (v: DecimalString) => string;
}) {
  const sign = signOf(value);
  const glyph = sign === "gain" ? "▲" : sign === "loss" ? "▼" : "•";
  return (
    <dd className={sign === "flat" ? undefined : `is-${sign}`}>
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

        return (
          <section key={row.instrumentId} className="result-summary__asset" aria-label={row.label}>
            <h3>{row.label}</h3>
            <p className="result-summary__date">{row.date} 기준</p>

            {noticeText !== null && <p className="result-summary__notice">{noticeText}</p>}

            <dl>
              <div>
                <dt>기여 원금</dt>
                <dd>{formatMoney(row.contributedCapital)}</dd>
              </div>
              <div>
                <dt>평가금액(총자산)</dt>
                <dd>{formatMoney(row.totalValue)}</dd>
              </div>
              <div>
                <dt>손익</dt>
                <SignedFigure
                  value={row.profitLoss.amount}
                  format={() => formatMoney(row.profitLoss)}
                />
              </div>
              <div>
                <dt>{row.assumptions.returnRateLabel}</dt>
                <SignedFigure value={row.returnRate} format={formatPercent} />
              </div>
              <div>
                <dt>{row.assumptions.maxDrawdownTotalValueLabel} (현재까지)</dt>
                <dd>{formatPercent(row.drawdownRateToDate)}</dd>
              </div>
              <div>
                <dt>데이터 상태</dt>
                <dd>{formatPriceStatus(row.priceStatus)}</dd>
              </div>
            </dl>

            {row.finalMetrics !== null && (
              <div className="result-summary__final">
                <h4>최종 결과</h4>
                <dl>
                  <div>
                    <dt>{row.assumptions.returnRateLabel}</dt>
                    <SignedFigure value={row.finalMetrics.finalReturnRate} format={formatPercent} />
                  </div>
                  <div>
                    <dt>{row.assumptions.maxDrawdownPriceLabel}</dt>
                    <dd>{formatPercent(row.finalMetrics.maxDrawdownPrice)}</dd>
                  </div>
                  <div>
                    <dt>{row.assumptions.maxDrawdownTotalValueLabel}</dt>
                    <dd>{formatPercent(row.finalMetrics.maxDrawdownTotalValue)}</dd>
                  </div>
                </dl>
              </div>
            )}

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

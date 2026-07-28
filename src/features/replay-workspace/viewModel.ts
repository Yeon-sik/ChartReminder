import type { Instrument } from "../../domain/instrument/instrument";
import {
  cumulativeReturnRate,
  normalizeToBase100,
  type DisplayMode,
} from "../../domain/market-data/priceNormalization";
import {
  parseDecimal,
  toChartNumber,
  toDecimalString,
  type DecimalString,
} from "../../domain/shared/decimal";
import {
  convertAmount,
  convertMoney,
  type DisplayCurrency,
  type UsdKrwRate,
} from "../../domain/shared/fxConversion";
import type { Money } from "../../domain/shared/money";
import type { TradingDate } from "../../domain/shared/time";
import type { ReplayDataset } from "../../domain/replay/replayDataset";
import type {
  SimulationAssumptions,
  SimulationMetrics,
  SimulationResult,
} from "../../domain/simulation/simulationEngine";
import {
  buildSimulationDays,
  type SimulationDay,
  type ValuationPrice,
} from "../../domain/simulation/simulationTimeline";

export type { DisplayMode };

export interface ChartPoint {
  readonly time: TradingDate;
  readonly value: number;
}

export interface AssetPriceSeries {
  readonly instrumentId: string;
  readonly label: string;
  readonly points: ChartPoint[];
  /**
   * 재생 커서 시점 기준 실제 가격("시점 기준 현재가") — 항상 자산 고유 통화로 표기한다.
   * 표시 기준(`normalized-100`/`cumulative-return`)이 지수·비율이라 실제 가격 감각을
   * 잃지 않도록 차트와 별개로 함께 보여준다(docs/00 "비교의 의미"). 관측이 없으면 null.
   */
  readonly currentPrice: Money | null;
  readonly currentPriceDate: TradingDate | null;
}

export interface PortfolioAssetValue {
  readonly instrumentId: string;
  readonly label: string;
  readonly totalValue: ChartPoint[];
}

export interface PortfolioSeries {
  /**
   * 통합 투자 설정(D-020)에 따라 비교 자산 전체에 같은 투자 규칙(모드·금액·주기)이
   * 적용되므로, 표시 통화 기준 기여 원금은 자산마다 동일하다 — 하나만 반환한다.
   */
  readonly contributedCapital: ChartPoint[];
  readonly assets: readonly PortfolioAssetValue[];
}

export interface ResultSummaryRow {
  readonly instrumentId: string;
  readonly label: string;
  readonly date: TradingDate;
  readonly contributedCapital: Money;
  readonly cash: Money;
  readonly marketValue: Money;
  readonly totalValue: Money;
  readonly profitLoss: Money;
  readonly returnRate: DecimalString;
  /** 총자산 기준, 커서까지의 실제 낙폭(peak-to-date) — 미래를 참조하지 않아 재생 중 표시해도 안전하다. */
  readonly drawdownRateToDate: DecimalString;
  readonly priceStatus: "fresh" | "carried-forward";
  /** 리플레이가 마지막 날에 도달했을 때만 채워진다 — 전체 구간 MDD 등 최종 지표는 완료 전 노출하지 않는다 (R6). */
  readonly finalMetrics: SimulationMetrics | null;
  readonly assumptions: SimulationAssumptions;
}

function hasPrice(day: SimulationDay): day is SimulationDay & { valuationPrice: ValuationPrice } {
  return day.valuationPrice !== null;
}

function instrumentLabel(instrument: Instrument): string {
  return `${instrument.displayName} (${instrument.symbol})`;
}

function transformPrices(
  prices: readonly DecimalString[],
  mode: DisplayMode,
  fromCurrency: string,
  displayCurrency: DisplayCurrency,
  usdKrwRate: UsdKrwRate | null,
): DecimalString[] {
  if (mode === "raw") {
    // raw만 절대 금액이라 표시 통화 환산 대상이다(정규화/누적수익률은 이미 통화 무관, D-020).
    return prices.map((price) => convertAmount(price, fromCurrency, displayCurrency, usdKrwRate));
  }
  if (mode === "normalized-100") {
    return normalizeToBase100(prices);
  }
  // cumulative-return: 표시 단위(%)로 스케일 변환은 Decimal에서 끝낸다 (차트 경계 직전에만 number 변환)
  return cumulativeReturnRate(prices).map((rate) => toDecimalString(parseDecimal(rate).times(100)));
}

/**
 * 자산별 가격 차트 시리즈. (docs/06 §4)
 *
 * **미래 데이터 비노출의 실제 구현 지점**: `cursorIndex`까지만 자른다. 이 함수는
 * `ReplayEngine.getState().cursor` 이외의 값을 커서로 받아서는 안 된다.
 *
 * `displayCurrency`/`usdKrwRate`는 `"raw"` 모드에서만 쓰인다(D-020) — 정규화·누적수익률은
 * 이미 통화 무관이다.
 */
export function buildPriceSeries(
  dataset: ReplayDataset,
  instrumentsById: Readonly<Record<string, Instrument>>,
  mode: DisplayMode,
  cursorIndex: number,
  displayCurrency: DisplayCurrency,
  usdKrwRate: UsdKrwRate | null,
): AssetPriceSeries[] {
  return Object.keys(instrumentsById).map((instrumentId) => {
    const instrument = instrumentsById[instrumentId];
    const days = buildSimulationDays(dataset, instrumentId).slice(0, cursorIndex + 1);
    const observed = days.filter(hasPrice);
    const dates = observed.map((day) => day.date);
    const rawPrices = observed.map((day) => day.valuationPrice.value);
    const transformed = transformPrices(
      rawPrices,
      mode,
      instrument.quoteCurrency,
      displayCurrency,
      usdKrwRate,
    );
    const lastIndex = rawPrices.length - 1;

    return {
      instrumentId,
      label: instrumentLabel(instrument),
      points: dates.map((time, index) => ({ time, value: toChartNumber(transformed[index]) })),
      currentPrice:
        lastIndex >= 0
          ? { amount: rawPrices[lastIndex], currency: instrument.quoteCurrency }
          : null,
      currentPriceDate: lastIndex >= 0 ? dates[lastIndex] : null,
    };
  });
}

/**
 * 원금/평가액 차트 시리즈. `cursorIndex`까지만 자른다 (위 R6 규칙과 동일).
 * 금액은 표시 통화로 환산해 반환한다(D-020) — 서로 다른 통화 자산도 같은 스케일로 비교 가능.
 *
 * 기여 원금은 통합 투자 설정(D-020)상 자산 간 동일해 첫 번째 결과에서만 뽑아 하나로
 * 통합한다 — 자산별 평가액(`assets[].totalValue`)만 각각 반환한다.
 */
export function buildPortfolioSeries(
  resultsByInstrumentId: Readonly<Record<string, SimulationResult>>,
  instrumentsById: Readonly<Record<string, Instrument>>,
  cursorIndex: number,
  displayCurrency: DisplayCurrency,
  usdKrwRate: UsdKrwRate | null,
): PortfolioSeries {
  const entries = Object.entries(resultsByInstrumentId);
  const [, firstResult] = entries[0];

  const contributedCapital = firstResult.snapshots.slice(0, cursorIndex + 1).map((s) => ({
    time: s.date,
    value: toChartNumber(convertMoney(s.contributedCapital, displayCurrency, usdKrwRate).amount),
  }));

  const assets: PortfolioAssetValue[] = entries.map(([instrumentId, result]) => ({
    instrumentId,
    label: instrumentLabel(instrumentsById[instrumentId]),
    totalValue: result.snapshots.slice(0, cursorIndex + 1).map((s) => ({
      time: s.date,
      value: toChartNumber(convertMoney(s.totalValue, displayCurrency, usdKrwRate).amount),
    })),
  }));

  return { contributedCapital, assets };
}

/**
 * 커서 시점의 결과 요약 한 줄. `cursorIndex`가 스냅샷 배열 범위 안이라고 신뢰한다 (ReplayEngine이 보장).
 * `Money` 필드는 표시 통화로 환산해 반환한다(D-020) — `profitLoss`처럼 부호가 있는 값도
 * 그대로 환산되므로(같은 비율 스케일) 손익 방향은 바뀌지 않는다.
 */
export function buildResultSummary(
  resultsByInstrumentId: Readonly<Record<string, SimulationResult>>,
  instrumentsById: Readonly<Record<string, Instrument>>,
  cursorIndex: number,
  displayCurrency: DisplayCurrency,
  usdKrwRate: UsdKrwRate | null,
): ResultSummaryRow[] {
  return Object.entries(resultsByInstrumentId).map(([instrumentId, result]) => {
    const snapshot = result.snapshots[cursorIndex];
    const isFinal = cursorIndex === result.snapshots.length - 1;
    const toDisplay = (money: Money) => convertMoney(money, displayCurrency, usdKrwRate);
    return {
      instrumentId,
      label: instrumentLabel(instrumentsById[instrumentId]),
      date: snapshot.date,
      contributedCapital: toDisplay(snapshot.contributedCapital),
      cash: toDisplay(snapshot.cash),
      marketValue: toDisplay(snapshot.marketValue),
      totalValue: toDisplay(snapshot.totalValue),
      profitLoss: toDisplay(snapshot.profitLoss),
      returnRate: snapshot.returnRate,
      drawdownRateToDate: snapshot.drawdownRate,
      priceStatus: snapshot.priceStatus,
      finalMetrics: isFinal ? result.metrics : null,
      assumptions: result.assumptions,
    };
  });
}

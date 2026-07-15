import type { DecimalString } from "../shared/decimal";
import { DomainValidationError } from "../shared/errors";
import type { TradingDate } from "../shared/time";
import { indexReplayDataset, type ReplayDataset } from "../replay/replayDataset";

/** 평가 가격과 그 신선도. (docs/02 §4) */
export interface ValuationPrice {
  readonly value: DecimalString;
  readonly status: "fresh" | "carried-forward";
  /** 이 가격이 실제로 관측된 거래일 */
  readonly observedAt: TradingDate;
}

/**
 * 시뮬레이션 엔진의 하루 입력.
 * - executionPrice: 이 날 체결 가능한 종가. 캔들이 없으면 null (휴장·데이터 없음).
 * - valuationPrice: 평가에 쓸 가격. 캔들이 없으면 마지막 관측 종가를
 *   carried-forward로 전달하고, 상장 전이라 관측 자체가 없으면 null.
 */
export interface SimulationDay {
  readonly date: TradingDate;
  readonly executionPrice: DecimalString | null;
  readonly valuationPrice: ValuationPrice | null;
}

export interface BuildSimulationDaysOptions {
  /** 수정주가 사용 (dividendPolicy 'adjusted-price'). 캔들에 adjustedClose가 없으면 close 사용 */
  readonly useAdjustedClose?: boolean;
}

/**
 * ReplayDataset의 합집합 타임라인에서 한 자산의 시뮬레이션 입력을 만든다.
 * (docs/04 §6: 평가용 마지막 가격 전달은 simulation input adapter가 처리하고 상태를 명시)
 */
export function buildSimulationDays(
  dataset: ReplayDataset,
  instrumentId: string,
  options: BuildSimulationDaysOptions = {},
): SimulationDay[] {
  if (!(instrumentId in dataset.seriesByInstrument)) {
    throw new DomainValidationError(`데이터셋에 없는 자산이다: ${instrumentId}`);
  }
  const index = indexReplayDataset(dataset);
  const days: SimulationDay[] = [];
  let lastObserved: ValuationPrice | null = null;

  for (const date of dataset.timeline) {
    const candle = index.candleAt(instrumentId, date);
    if (candle !== undefined) {
      const price =
        options.useAdjustedClose === true && candle.adjustedClose !== undefined
          ? candle.adjustedClose
          : candle.close;
      lastObserved = { value: price, status: "fresh", observedAt: date };
      days.push({ date, executionPrice: price, valuationPrice: lastObserved });
    } else {
      days.push({
        date,
        executionPrice: null,
        valuationPrice:
          lastObserved === null ? null : { ...lastObserved, status: "carried-forward" },
      });
    }
  }
  return days;
}

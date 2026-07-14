import type { Candle, CandleInterval } from "../market-data/candle";
import { DomainValidationError } from "../shared/errors";
import type { TradingDate } from "../shared/time";
import { unionTradingDates } from "./timeline";

/** 한 자산의 오름차순 캔들 시계열. 거래일 중복이 없어야 한다. */
export interface CandleSeries {
  readonly instrumentId: string;
  readonly candles: readonly Candle[];
}

export interface ReplayDatasetMetadata {
  readonly interval: CandleInterval;
}

/**
 * 리플레이 준비가 끝난 데이터셋. (docs/02 §4)
 *
 * 타임라인은 자산 거래일의 합집합이다. 특정 자산에 없는 날짜는 캔들을
 * 생성하지 않으며(gap 유지), 평가용 마지막 가격 전달은 M4의
 * simulation input adapter가 `carried-forward` 상태로 처리한다.
 */
export interface ReplayDataset {
  readonly timeline: readonly TradingDate[];
  readonly seriesByInstrument: Readonly<Record<string, CandleSeries>>;
  readonly metadata: ReplayDatasetMetadata;
}

/**
 * 검증과 함께 ReplayDataset을 만든다.
 * 자산별 캔들은 거래일 오름차순·중복 없음이어야 한다 (저장 전 정규화 완료 전제).
 */
export function buildReplayDataset(
  series: readonly CandleSeries[],
  metadata: ReplayDatasetMetadata,
): ReplayDataset {
  const seriesByInstrument: Record<string, CandleSeries> = {};

  for (const entry of series) {
    if (entry.instrumentId.trim() === "") {
      throw new DomainValidationError("instrumentId가 비어 있는 시계열이 있다");
    }
    if (entry.instrumentId in seriesByInstrument) {
      throw new DomainValidationError(`중복된 자산 시계열이다: ${entry.instrumentId}`);
    }
    for (let i = 0; i < entry.candles.length; i += 1) {
      const candle = entry.candles[i];
      if (candle.instrumentId !== entry.instrumentId) {
        throw new DomainValidationError(
          `시계열(${entry.instrumentId})에 다른 자산의 캔들이 있다: ${candle.instrumentId}`,
        );
      }
      if (candle.interval !== metadata.interval) {
        throw new DomainValidationError(
          `interval이 데이터셋(${metadata.interval})과 다르다: ${candle.interval}`,
        );
      }
      if (i > 0 && entry.candles[i - 1].tradingDate >= candle.tradingDate) {
        throw new DomainValidationError(
          `시계열(${entry.instrumentId})이 거래일 오름차순·중복 없음을 위반한다: ` +
            `${entry.candles[i - 1].tradingDate} → ${candle.tradingDate}`,
        );
      }
    }
    seriesByInstrument[entry.instrumentId] = entry;
  }

  const timeline = unionTradingDates(
    series.map((entry) => entry.candles.map((candle) => candle.tradingDate)),
  );

  return { timeline, seriesByInstrument, metadata };
}

/**
 * 날짜별 캔들 조회 인덱스. 해당 날짜에 캔들이 없는 자산은 undefined를
 * 반환한다 — 값을 만들어 채우지 않는다 (gap 유지, docs/04 §6).
 */
export interface ReplayDatasetIndex {
  candleAt(instrumentId: string, date: TradingDate): Candle | undefined;
}

export function indexReplayDataset(dataset: ReplayDataset): ReplayDatasetIndex {
  const byInstrument = new Map<string, Map<TradingDate, Candle>>();
  for (const series of Object.values(dataset.seriesByInstrument)) {
    const byDate = new Map<TradingDate, Candle>();
    for (const candle of series.candles) {
      byDate.set(candle.tradingDate, candle);
    }
    byInstrument.set(series.instrumentId, byDate);
  }
  return {
    candleAt: (instrumentId, date) => byInstrument.get(instrumentId)?.get(date),
  };
}

import type { Candle, CandleInterval } from "../../domain/market-data/candle";
import type { UtcTimeRange } from "../../domain/market-data/timeRange";
import type { UtcTimestampMs } from "../../domain/shared/time";

/** 캐시 저장 단위. 캔들과 함께 "이 범위는 조회 완료"라는 커버리지를 기록한다. */
export interface CandleBatch {
  readonly instrumentId: string;
  readonly interval: CandleInterval;
  readonly providerId: string;
  readonly candles: readonly Candle[];
  /** 공급자가 권위 있게 응답한 범위. 캔들이 비어도 커버리지는 기록한다. */
  readonly coveredRange: UtcTimeRange;
  readonly fetchedAtUtcMs: UtcTimestampMs;
}

export interface CandleRangeQuery {
  readonly instrumentId: string;
  readonly interval: CandleInterval;
  readonly providerId: string;
  readonly range: UtcTimeRange;
}

export interface CandleRangeResult {
  readonly candles: readonly Candle[];
  /** 요청 범위와 겹치는 커버리지. 누락 구간 분석의 입력이 된다. */
  readonly coveredRanges: readonly UtcTimeRange[];
}

/** 캔들 캐시 저장소 포트. (docs/01 §4, docs/07 §2) */
export interface CandleRepository {
  findRange(query: CandleRangeQuery): Promise<CandleRangeResult>;
  upsertBatch(batch: CandleBatch): Promise<void>;
}

import type { Instrument } from "../../domain/instrument/instrument";
import type { Candle, CandleInterval } from "../../domain/market-data/candle";
import type { UtcTimeRange } from "../../domain/market-data/timeRange";
import type { UtcTimestampMs } from "../../domain/shared/time";

/** 캔들 조회 요청. range는 openTime 기준 반개구간 [startMs, endMs)다. */
export interface CandleQuery {
  readonly instrument: Instrument;
  readonly interval: CandleInterval;
  readonly range: UtcTimeRange;
}

/**
 * 공급자가 반환하는 정규화 완료 배치.
 *
 * 구현 계약(모든 Provider가 지켜야 하며 계약 테스트로 검증한다):
 * - candles는 도메인 불변조건을 통과하고, openTime 오름차순이며, 중복이 없고,
 *   요청 범위 밖 데이터가 절단된 상태다.
 * - completeRange는 공급자가 권위 있게 응답한 범위다. 이 범위 안에서 캔들이
 *   없으면 "상장 이전 또는 데이터 없음"이지 조회 실패가 아니다.
 * - 요청 범위가 아직 닫힌 데이터가 없는 구간(미래·진행 중인 날)뿐이면
 *   completeRange는 null이고 캐시에 커버리지를 기록하지 않는다.
 */
export interface ProviderCandleBatch {
  readonly providerId: string;
  readonly candles: readonly Candle[];
  readonly requestedRange: UtcTimeRange;
  readonly completeRange: UtcTimeRange | null;
  readonly fetchedAtUtcMs: UtcTimestampMs;
}

/** 시장 데이터 공급자 포트. (docs/01 §4, docs/03) */
export interface MarketDataProvider {
  readonly id: string;
  searchInstruments(query: string): Promise<Instrument[]>;
  getCandles(query: CandleQuery): Promise<ProviderCandleBatch>;
}

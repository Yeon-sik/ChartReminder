import type { Candle } from "../../domain/market-data/candle";
import { subtractUtcTimeRanges, type UtcTimeRange } from "../../domain/market-data/timeRange";
import { systemClock, type Clock } from "../ports/clock";
import type { CandleRepository } from "../ports/candleRepository";
import type { CandleQuery, MarketDataProvider } from "../ports/marketDataProvider";

const DAY_MS = 86_400_000;

export interface EnsureCandleRangeCachedDeps {
  readonly provider: MarketDataProvider;
  readonly repository: CandleRepository;
  readonly clock?: Clock;
}

export interface EnsureCandleRangeCachedResult {
  readonly candles: readonly Candle[];
  /** 조회 범위와 겹치는 캐시 커버리지 (조회 후 기준) */
  readonly coveredRanges: readonly UtcTimeRange[];
  /** 이번 실행에서 공급자에게 요청한 누락 범위. 비어 있으면 전부 캐시에서 왔다. */
  readonly fetchedRanges: readonly UtcTimeRange[];
}

/**
 * 요청 기간의 캔들을 "캐시 우선, 누락 구간만 공급자 조회"로 보장한다. (docs/03 §3)
 *
 * - 진행 중인 오늘(UTC)과 미래는 조회 대상에서 제외한다. 닫힌 캔들만 캐시한다.
 * - 공급자 오류는 삼키지 않고 전파한다. 이미 저장된 구간은 유지되므로
 *   재시도 시 남은 누락 구간만 다시 요청한다 (부분 성공을 전체 성공으로 위장하지 않음).
 */
export async function ensureCandleRangeCached(
  deps: EnsureCandleRangeCachedDeps,
  query: CandleQuery,
): Promise<EnsureCandleRangeCachedResult> {
  const clock = deps.clock ?? systemClock;
  const currentUtcDayStartMs = Math.floor(clock.nowUtcMs() / DAY_MS) * DAY_MS;
  const effectiveEndMs = Math.min(query.range.endMs, currentUtcDayStartMs);

  if (effectiveEndMs <= query.range.startMs) {
    return { candles: [], coveredRanges: [], fetchedRanges: [] };
  }

  const effectiveRange: UtcTimeRange = { startMs: query.range.startMs, endMs: effectiveEndMs };
  const repositoryQuery = {
    instrumentId: query.instrument.id,
    interval: query.interval,
    providerId: deps.provider.id,
    range: effectiveRange,
  };

  const cached = await deps.repository.findRange(repositoryQuery);
  const missingRanges = subtractUtcTimeRanges(effectiveRange, cached.coveredRanges);

  if (missingRanges.length === 0) {
    return { candles: cached.candles, coveredRanges: cached.coveredRanges, fetchedRanges: [] };
  }

  for (const missingRange of missingRanges) {
    const batch = await deps.provider.getCandles({
      instrument: query.instrument,
      interval: query.interval,
      range: missingRange,
    });
    if (batch.completeRange !== null) {
      await deps.repository.upsertBatch({
        instrumentId: query.instrument.id,
        interval: query.interval,
        providerId: deps.provider.id,
        candles: batch.candles,
        coveredRange: batch.completeRange,
        fetchedAtUtcMs: batch.fetchedAtUtcMs,
      });
    }
  }

  const refreshed = await deps.repository.findRange(repositoryQuery);
  return {
    candles: refreshed.candles,
    coveredRanges: refreshed.coveredRanges,
    fetchedRanges: missingRanges,
  };
}

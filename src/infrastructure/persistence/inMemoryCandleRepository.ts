import type {
  CandleBatch,
  CandleRangeQuery,
  CandleRangeResult,
  CandleRepository,
} from "../../application/ports/candleRepository";
import type { Candle } from "../../domain/market-data/candle";
import { normalizeUtcTimeRanges, type UtcTimeRange } from "../../domain/market-data/timeRange";

interface Bucket {
  readonly candles: Map<number, Candle>;
  coverage: UtcTimeRange[];
}

function bucketKey(instrumentId: string, interval: string, providerId: string): string {
  return `${instrumentId}|${interval}|${providerId}`;
}

/**
 * 브라우저 프리뷰 전용 메모리 캐시. (M5, `src/app/composition.ts`에서만 사용)
 *
 * `isTauri()`가 false인 개발 미리보기(Playwright 검증 등)에서 `SqliteCandleRepository`
 * 대신 주입한다 — `@tauri-apps/plugin-sql`은 Tauri IPC 브리지가 있어야 동작하기 때문이다.
 * **영속성이 없다.** 앱을 새로고침하면 캐시가 사라진다. 실제 데스크톱 실행 경로는
 * 항상 `SqliteCandleRepository`를 쓴다.
 */
export class InMemoryCandleRepository implements CandleRepository {
  private readonly buckets = new Map<string, Bucket>();

  findRange(query: CandleRangeQuery): Promise<CandleRangeResult> {
    const bucket = this.buckets.get(
      bucketKey(query.instrumentId, query.interval, query.providerId),
    );
    if (bucket === undefined) {
      return Promise.resolve({ candles: [], coveredRanges: [] });
    }
    const candles = [...bucket.candles.values()]
      .filter(
        (candle) =>
          candle.openTimeUtcMs >= query.range.startMs && candle.openTimeUtcMs < query.range.endMs,
      )
      .sort((a, b) => a.openTimeUtcMs - b.openTimeUtcMs);
    const coveredRanges = bucket.coverage.filter(
      (range) => range.endMs > query.range.startMs && range.startMs < query.range.endMs,
    );
    return Promise.resolve({ candles, coveredRanges });
  }

  upsertBatch(batch: CandleBatch): Promise<void> {
    const key = bucketKey(batch.instrumentId, batch.interval, batch.providerId);
    const bucket = this.buckets.get(key) ?? { candles: new Map<number, Candle>(), coverage: [] };
    for (const candle of batch.candles) {
      bucket.candles.set(candle.openTimeUtcMs, candle);
    }
    bucket.coverage = normalizeUtcTimeRanges([...bucket.coverage, batch.coveredRange]);
    this.buckets.set(key, bucket);
    return Promise.resolve();
  }
}

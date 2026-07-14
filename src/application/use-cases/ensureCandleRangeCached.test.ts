import { beforeEach, describe, expect, it } from "vitest";

import type { Candle } from "../../domain/market-data/candle";
import type { UtcTimeRange } from "../../domain/market-data/timeRange";
import { createInMemorySqlDatabase } from "../../test/betterSqliteDatabase";
import { runMigrations } from "../../infrastructure/persistence/migrationRunner";
import { SqliteCandleRepository } from "../../infrastructure/persistence/sqliteCandleRepository";
import { BINANCE_INSTRUMENTS } from "../../infrastructure/providers/binance/binanceCatalog";
import { ProviderNetworkError } from "../ports/providerErrors";
import type {
  CandleQuery,
  MarketDataProvider,
  ProviderCandleBatch,
} from "../ports/marketDataProvider";
import { ensureCandleRangeCached } from "./ensureCandleRangeCached";

const DAY_MS = 86_400_000;
const JAN_1 = Date.UTC(2024, 0, 1);
const BTC = BINANCE_INSTRUMENTS[0];
/** 2024-02-01T12:00Z: 테스트 범위(1월)가 전부 닫힌 과거가 된다 */
const clock = { nowUtcMs: () => Date.UTC(2024, 1, 1, 12) };

function makeCandle(dayOffset: number): Candle {
  const openTimeUtcMs = JAN_1 + dayOffset * DAY_MS;
  return {
    instrumentId: BTC.id,
    interval: "1d",
    openTimeUtcMs,
    closeTimeUtcMs: openTimeUtcMs + DAY_MS - 1,
    tradingDate: new Date(openTimeUtcMs).toISOString().slice(0, 10),
    open: "100",
    high: "110",
    low: "90",
    close: "105",
    volume: "1000",
    quoteCurrency: "USDT",
    source: {
      providerId: "binance",
      providerSymbol: "BTCUSDT",
      fetchedAtUtcMs: clock.nowUtcMs(),
      priceBasis: "raw",
    },
  };
}

/** 요청 범위에 해당하는 캔들을 결정론적으로 돌려주는 가짜 Provider. 호출을 기록한다. */
class FakeProvider implements MarketDataProvider {
  readonly id = "binance";
  readonly requestedRanges: UtcTimeRange[] = [];
  failNext = false;

  searchInstruments(): Promise<never[]> {
    return Promise.resolve([]);
  }

  getCandles(query: CandleQuery): Promise<ProviderCandleBatch> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new ProviderNetworkError(this.id, "네트워크 실패 (테스트)"));
    }
    this.requestedRanges.push(query.range);
    const candles: Candle[] = [];
    for (let ms = query.range.startMs; ms < query.range.endMs; ms += DAY_MS) {
      candles.push(makeCandle((ms - JAN_1) / DAY_MS));
    }
    return Promise.resolve({
      providerId: this.id,
      candles,
      requestedRange: query.range,
      completeRange: query.range,
      fetchedAtUtcMs: clock.nowUtcMs(),
    });
  }
}

function dayRange(startDay: number, endDay: number): UtcTimeRange {
  return { startMs: JAN_1 + startDay * DAY_MS, endMs: JAN_1 + endDay * DAY_MS };
}

function makeQuery(startDay: number, endDay: number): CandleQuery {
  return { instrument: BTC, interval: "1d", range: dayRange(startDay, endDay) };
}

describe("ensureCandleRangeCached (fixture → 정규화 → SQLite → 조회 통합)", () => {
  let db: ReturnType<typeof createInMemorySqlDatabase>;
  let repository: SqliteCandleRepository;
  let provider: FakeProvider;

  beforeEach(async () => {
    db = createInMemorySqlDatabase();
    await runMigrations(db);
    repository = new SqliteCandleRepository(db);
    provider = new FakeProvider();
  });

  it("캐시가 비었으면 전체 범위를 조회해 저장하고 반환한다", async () => {
    const result = await ensureCandleRangeCached({ provider, repository, clock }, makeQuery(0, 5));

    expect(result.candles).toHaveLength(5);
    expect(result.fetchedRanges).toEqual([dayRange(0, 5)]);
    expect(provider.requestedRanges).toEqual([dayRange(0, 5)]);
  });

  it("동일 기간 재조회는 공급자를 호출하지 않고 캐시를 사용한다", async () => {
    await ensureCandleRangeCached({ provider, repository, clock }, makeQuery(0, 5));
    const second = await ensureCandleRangeCached({ provider, repository, clock }, makeQuery(0, 5));

    expect(second.candles).toHaveLength(5);
    expect(second.fetchedRanges).toEqual([]);
    expect(provider.requestedRanges).toHaveLength(1);
  });

  it("부분 캐시면 누락 구간만 공급자에게 요청한다", async () => {
    await ensureCandleRangeCached({ provider, repository, clock }, makeQuery(10, 15));
    const widened = await ensureCandleRangeCached(
      { provider, repository, clock },
      makeQuery(5, 20),
    );

    expect(widened.candles).toHaveLength(15);
    expect(provider.requestedRanges.slice(1)).toEqual([dayRange(5, 10), dayRange(15, 20)]);
  });

  it("진행 중인 오늘(UTC)과 미래는 조회하지 않는다", async () => {
    const nearNow = { nowUtcMs: () => JAN_1 + 3 * DAY_MS + 7_200_000 }; // 1월 4일 02:00Z
    const result = await ensureCandleRangeCached(
      { provider, repository, clock: nearNow },
      makeQuery(0, 30),
    );

    expect(provider.requestedRanges).toEqual([dayRange(0, 3)]);
    expect(result.candles).toHaveLength(3);
  });

  it("전부 미래인 범위는 공급자 호출 없이 빈 결과다", async () => {
    const result = await ensureCandleRangeCached(
      { provider, repository, clock },
      makeQuery(60, 90),
    );
    expect(result.candles).toEqual([]);
    expect(provider.requestedRanges).toEqual([]);
  });

  it("공급자 오류를 삼키지 않고 전파하며 커버리지를 오염시키지 않는다", async () => {
    provider.failNext = true;
    await expect(
      ensureCandleRangeCached({ provider, repository, clock }, makeQuery(0, 5)),
    ).rejects.toThrow(ProviderNetworkError);

    // 실패한 범위는 커버되지 않았으므로 재시도 시 다시 요청한다
    const retried = await ensureCandleRangeCached({ provider, repository, clock }, makeQuery(0, 5));
    expect(retried.candles).toHaveLength(5);
    expect(retried.fetchedRanges).toEqual([dayRange(0, 5)]);
  });

  it("completeRange가 null인 배치는 커버리지를 기록하지 않는다", async () => {
    const nullProvider: MarketDataProvider = {
      id: "binance",
      searchInstruments: () => Promise.resolve([]),
      getCandles: (query) =>
        Promise.resolve({
          providerId: "binance",
          candles: [],
          requestedRange: query.range,
          completeRange: null,
          fetchedAtUtcMs: clock.nowUtcMs(),
        }),
    };
    const result = await ensureCandleRangeCached(
      { provider: nullProvider, repository, clock },
      makeQuery(0, 2),
    );
    expect(result.candles).toEqual([]);
    expect(result.coveredRanges).toEqual([]);
  });

  it("상장 이전 기간(빈 결과)도 커버리지로 기록해 재조회하지 않는다", async () => {
    const emptyRanges: UtcTimeRange[] = [];
    const emptyProvider: MarketDataProvider = {
      id: "binance",
      searchInstruments: () => Promise.resolve([]),
      getCandles: (query) => {
        emptyRanges.push(query.range);
        return Promise.resolve({
          providerId: "binance",
          candles: [],
          requestedRange: query.range,
          completeRange: query.range,
          fetchedAtUtcMs: clock.nowUtcMs(),
        });
      },
    };

    const first = await ensureCandleRangeCached(
      { provider: emptyProvider, repository, clock },
      makeQuery(0, 5),
    );
    const second = await ensureCandleRangeCached(
      { provider: emptyProvider, repository, clock },
      makeQuery(0, 5),
    );

    expect(first.candles).toEqual([]);
    expect(second.candles).toEqual([]);
    expect(emptyRanges).toHaveLength(1); // 두 번째는 캐시 커버리지로 응답
  });
});

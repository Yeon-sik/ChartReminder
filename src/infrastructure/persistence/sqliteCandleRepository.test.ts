import { beforeEach, describe, expect, it } from "vitest";

import type { CandleBatch } from "../../application/ports/candleRepository";
import type { Candle } from "../../domain/market-data/candle";
import { DomainValidationError } from "../../domain/shared/errors";
import { createInMemorySqlDatabase } from "../../test/betterSqliteDatabase";
import { runMigrations } from "./migrationRunner";
import { SqliteCandleRepository } from "./sqliteCandleRepository";

const DAY_MS = 86_400_000;
const JAN_1 = Date.UTC(2024, 0, 1);
const FETCHED_AT = Date.UTC(2024, 0, 10);

function makeCandle(dayOffset: number, close = "105"): Candle {
  const openTimeUtcMs = JAN_1 + dayOffset * DAY_MS;
  const date = new Date(openTimeUtcMs).toISOString().slice(0, 10);
  return {
    instrumentId: "crypto-btc-usdt",
    interval: "1d",
    openTimeUtcMs,
    closeTimeUtcMs: openTimeUtcMs + DAY_MS - 1,
    tradingDate: date,
    open: "100",
    high: "110",
    low: "90",
    close,
    volume: "1000",
    quoteCurrency: "USDT",
    source: {
      providerId: "binance",
      providerSymbol: "BTCUSDT",
      fetchedAtUtcMs: FETCHED_AT,
      priceBasis: "raw",
    },
  };
}

function makeBatch(candles: Candle[], startDay: number, endDay: number): CandleBatch {
  return {
    instrumentId: "crypto-btc-usdt",
    interval: "1d",
    providerId: "binance",
    candles,
    coveredRange: { startMs: JAN_1 + startDay * DAY_MS, endMs: JAN_1 + endDay * DAY_MS },
    fetchedAtUtcMs: FETCHED_AT,
  };
}

function rangeQuery(startDay: number, endDay: number) {
  return {
    instrumentId: "crypto-btc-usdt",
    interval: "1d" as const,
    providerId: "binance",
    range: { startMs: JAN_1 + startDay * DAY_MS, endMs: JAN_1 + endDay * DAY_MS },
  };
}

describe("SqliteCandleRepository (실제 SQLite 통합)", () => {
  let db: ReturnType<typeof createInMemorySqlDatabase>;
  let repository: SqliteCandleRepository;

  beforeEach(async () => {
    db = createInMemorySqlDatabase();
    await runMigrations(db);
    repository = new SqliteCandleRepository(db);
  });

  it("저장한 캔들을 손실 없이 왕복 조회한다", async () => {
    const candles = [makeCandle(0), makeCandle(1, "110.55500000")];
    await repository.upsertBatch(makeBatch(candles, 0, 2));

    const result = await repository.findRange(rangeQuery(0, 2));
    expect(result.candles).toEqual(candles);
    expect(result.coveredRanges).toEqual([{ startMs: JAN_1, endMs: JAN_1 + 2 * DAY_MS }]);
  });

  it("범위 조회는 반개구간 [start, end)를 지키고 오름차순이다", async () => {
    await repository.upsertBatch(makeBatch([makeCandle(0), makeCandle(1), makeCandle(2)], 0, 3));

    const result = await repository.findRange(rangeQuery(1, 2));
    expect(result.candles.map((candle) => candle.tradingDate)).toEqual(["2024-01-02"]);
  });

  it("같은 키의 캔들을 덮어쓴다 (중복 키: instrument, interval, openTime, provider)", async () => {
    await repository.upsertBatch(makeBatch([makeCandle(0, "100")], 0, 1));
    await repository.upsertBatch(makeBatch([makeCandle(0, "108")], 0, 1));

    const result = await repository.findRange(rangeQuery(0, 1));
    expect(result.candles).toHaveLength(1);
    expect(result.candles[0].close).toBe("108");
  });

  it("빈 캔들 배치도 커버리지를 기록한다 (상장 이전 기간)", async () => {
    await repository.upsertBatch(makeBatch([], 0, 5));

    const result = await repository.findRange(rangeQuery(0, 5));
    expect(result.candles).toEqual([]);
    expect(result.coveredRanges).toEqual([{ startMs: JAN_1, endMs: JAN_1 + 5 * DAY_MS }]);
  });

  it("맞닿거나 겹치는 커버리지를 병합해 보관한다", async () => {
    await repository.upsertBatch(makeBatch([makeCandle(0)], 0, 1));
    await repository.upsertBatch(makeBatch([makeCandle(1)], 1, 2));
    await repository.upsertBatch(makeBatch([makeCandle(4)], 4, 5));

    const result = await repository.findRange(rangeQuery(0, 10));
    expect(result.coveredRanges).toEqual([
      { startMs: JAN_1, endMs: JAN_1 + 2 * DAY_MS },
      { startMs: JAN_1 + 4 * DAY_MS, endMs: JAN_1 + 5 * DAY_MS },
    ]);
  });

  it("다른 자산·공급자의 데이터와 격리된다", async () => {
    await repository.upsertBatch(makeBatch([makeCandle(0)], 0, 1));
    const other = await repository.findRange({
      ...rangeQuery(0, 1),
      instrumentId: "crypto-eth-usdt",
    });
    expect(other.candles).toEqual([]);
    expect(other.coveredRanges).toEqual([]);
  });

  it("배치 키와 다른 캔들을 거부한다", async () => {
    const foreign = { ...makeCandle(0), instrumentId: "crypto-eth-usdt" };
    await expect(repository.upsertBatch(makeBatch([foreign], 0, 1))).rejects.toThrow(
      DomainValidationError,
    );
  });

  it("청크 크기(50)를 넘는 큰 배치를 저장한다", async () => {
    const candles = Array.from({ length: 130 }, (_, index) => makeCandle(index));
    await repository.upsertBatch(makeBatch(candles, 0, 130));

    const result = await repository.findRange(rangeQuery(0, 130));
    expect(result.candles).toHaveLength(130);
    expect(result.candles[129].tradingDate).toBe("2024-05-09");
  });

  it("선택 필드(volume 없음, dataVersion 있음)를 보존한다", async () => {
    const candle: Candle = {
      ...makeCandle(0),
      volume: undefined,
      source: { ...makeCandle(0).source, dataVersion: "v2" },
    };
    await repository.upsertBatch(makeBatch([candle], 0, 1));

    const result = await repository.findRange(rangeQuery(0, 1));
    expect(result.candles[0].volume).toBeUndefined();
    expect(result.candles[0].source.dataVersion).toBe("v2");
  });
});

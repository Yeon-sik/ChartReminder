import { describe, expect, it } from "vitest";

import { ensureCandleRangeCached } from "../../application/use-cases/ensureCandleRangeCached";
import type {
  CandleQuery,
  MarketDataProvider,
  ProviderCandleBatch,
} from "../../application/ports/marketDataProvider";
import { BINANCE_INSTRUMENTS } from "../providers/binance/binanceCatalog";
import type { Candle } from "../../domain/market-data/candle";
import { InMemoryCandleRepository } from "./inMemoryCandleRepository";

const DAY_MS = 86_400_000;
const JAN_1 = Date.UTC(2024, 0, 1);
const BTC = BINANCE_INSTRUMENTS[0];
const ETH = BINANCE_INSTRUMENTS[1];
const clock = { nowUtcMs: () => Date.UTC(2024, 1, 1, 12) };

function makeCandle(instrumentId: string, dayOffset: number): Candle {
  const openTimeUtcMs = JAN_1 + dayOffset * DAY_MS;
  return {
    instrumentId,
    interval: "1d",
    openTimeUtcMs,
    closeTimeUtcMs: openTimeUtcMs + DAY_MS - 1,
    tradingDate: new Date(openTimeUtcMs).toISOString().slice(0, 10),
    open: "100",
    high: "110",
    low: "90",
    close: "105",
    quoteCurrency: "USDT",
    source: {
      providerId: "binance",
      providerSymbol: instrumentId,
      fetchedAtUtcMs: clock.nowUtcMs(),
      priceBasis: "raw",
    },
  };
}

class RecordingProvider implements MarketDataProvider {
  readonly id = "binance";
  readonly requestedRanges: { instrumentId: string; startMs: number; endMs: number }[] = [];

  searchInstruments(): Promise<never[]> {
    return Promise.resolve([]);
  }

  getCandles(query: CandleQuery): Promise<ProviderCandleBatch> {
    this.requestedRanges.push({
      instrumentId: query.instrument.id,
      startMs: query.range.startMs,
      endMs: query.range.endMs,
    });
    const candles: Candle[] = [];
    for (let ms = query.range.startMs; ms < query.range.endMs; ms += DAY_MS) {
      candles.push(makeCandle(query.instrument.id, (ms - JAN_1) / DAY_MS));
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

describe("InMemoryCandleRepository — 기본 저장·조회", () => {
  it("upsert한 캔들을 요청 범위로 되돌려준다", async () => {
    const repo = new InMemoryCandleRepository();
    await repo.upsertBatch({
      instrumentId: BTC.id,
      interval: "1d",
      providerId: "binance",
      candles: [makeCandle(BTC.id, 0), makeCandle(BTC.id, 1), makeCandle(BTC.id, 2)],
      coveredRange: { startMs: JAN_1, endMs: JAN_1 + 3 * DAY_MS },
      fetchedAtUtcMs: clock.nowUtcMs(),
    });

    const result = await repo.findRange({
      instrumentId: BTC.id,
      interval: "1d",
      providerId: "binance",
      range: { startMs: JAN_1, endMs: JAN_1 + 3 * DAY_MS },
    });

    expect(result.candles).toHaveLength(3);
    expect(result.candles.map((c) => c.tradingDate)).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
    expect(result.coveredRanges).toEqual([{ startMs: JAN_1, endMs: JAN_1 + 3 * DAY_MS }]);
  });

  it("자산이 다르면 저장·조회가 서로 섞이지 않는다", async () => {
    const repo = new InMemoryCandleRepository();
    await repo.upsertBatch({
      instrumentId: BTC.id,
      interval: "1d",
      providerId: "binance",
      candles: [makeCandle(BTC.id, 0)],
      coveredRange: { startMs: JAN_1, endMs: JAN_1 + DAY_MS },
      fetchedAtUtcMs: clock.nowUtcMs(),
    });

    const ethResult = await repo.findRange({
      instrumentId: ETH.id,
      interval: "1d",
      providerId: "binance",
      range: { startMs: JAN_1, endMs: JAN_1 + DAY_MS },
    });

    expect(ethResult.candles).toEqual([]);
    expect(ethResult.coveredRanges).toEqual([]);
  });

  it("인접한 커버리지를 병합한다", async () => {
    const repo = new InMemoryCandleRepository();
    await repo.upsertBatch({
      instrumentId: BTC.id,
      interval: "1d",
      providerId: "binance",
      candles: [makeCandle(BTC.id, 0)],
      coveredRange: { startMs: JAN_1, endMs: JAN_1 + DAY_MS },
      fetchedAtUtcMs: clock.nowUtcMs(),
    });
    await repo.upsertBatch({
      instrumentId: BTC.id,
      interval: "1d",
      providerId: "binance",
      candles: [makeCandle(BTC.id, 1)],
      coveredRange: { startMs: JAN_1 + DAY_MS, endMs: JAN_1 + 2 * DAY_MS },
      fetchedAtUtcMs: clock.nowUtcMs(),
    });

    const result = await repo.findRange({
      instrumentId: BTC.id,
      interval: "1d",
      providerId: "binance",
      range: { startMs: JAN_1, endMs: JAN_1 + 2 * DAY_MS },
    });

    expect(result.coveredRanges).toEqual([{ startMs: JAN_1, endMs: JAN_1 + 2 * DAY_MS }]);
  });
});

describe("InMemoryCandleRepository — ensureCandleRangeCached 통합", () => {
  it("같은 범위를 재조회하면 Provider를 다시 호출하지 않는다 (캐시 우선, docs/03 §3)", async () => {
    const provider = new RecordingProvider();
    const repository = new InMemoryCandleRepository();
    const deps = { provider, repository, clock };
    const query: CandleQuery = {
      instrument: BTC,
      interval: "1d",
      range: { startMs: JAN_1, endMs: JAN_1 + 5 * DAY_MS },
    };

    const first = await ensureCandleRangeCached(deps, query);
    const second = await ensureCandleRangeCached(deps, query);

    expect(first.candles).toHaveLength(5);
    expect(second.candles).toHaveLength(5);
    expect(second.fetchedRanges).toEqual([]);
    expect(provider.requestedRanges).toHaveLength(1);
  });

  it("겹치지 않는 두 자산 조회 시 누락 구간만 각자 요청한다", async () => {
    const provider = new RecordingProvider();
    const repository = new InMemoryCandleRepository();
    const deps = { provider, repository, clock };

    await ensureCandleRangeCached(deps, {
      instrument: BTC,
      interval: "1d",
      range: { startMs: JAN_1, endMs: JAN_1 + 3 * DAY_MS },
    });
    await ensureCandleRangeCached(deps, {
      instrument: ETH,
      interval: "1d",
      range: { startMs: JAN_1, endMs: JAN_1 + 3 * DAY_MS },
    });

    expect(provider.requestedRanges).toHaveLength(2);
    expect(provider.requestedRanges.map((r) => r.instrumentId)).toEqual([BTC.id, ETH.id]);
  });
});

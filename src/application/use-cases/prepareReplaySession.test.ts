import { describe, expect, it } from "vitest";

import type { Instrument } from "../../domain/instrument/instrument";
import type { Candle } from "../../domain/market-data/candle";
import type { UtcTimeRange } from "../../domain/market-data/timeRange";
import { DomainValidationError } from "../../domain/shared/errors";
import type { SimulationConfig } from "../../domain/simulation/simulationConfig";
import { ProviderNetworkError } from "../ports/providerErrors";
import type {
  CandleBatch,
  CandleRangeQuery,
  CandleRangeResult,
  CandleRepository,
} from "../ports/candleRepository";
import type {
  CandleQuery,
  MarketDataProvider,
  ProviderCandleBatch,
} from "../ports/marketDataProvider";
import { prepareReplaySession, type AssetSelection } from "./prepareReplaySession";

const DAY_MS = 86_400_000;
const RANGE_START = Date.UTC(2024, 0, 1); // 2024-01-01
const RANGE_END = Date.UTC(2024, 0, 11); // 2024-01-11 (열흘)

const BTC: Instrument = {
  id: "crypto-btc-usdt",
  symbol: "BTC/USDT",
  displayName: "Bitcoin",
  assetClass: "crypto",
  market: "BINANCE",
  quoteCurrency: "USDT",
  exchangeTimezone: "UTC",
  providerId: "fake",
  providerSymbol: "BTCUSDT",
  status: "active",
};

const ETH: Instrument = {
  ...BTC,
  id: "crypto-eth-usdt",
  symbol: "ETH/USDT",
  providerSymbol: "ETHUSDT",
};

/** 2번째 Provider 소속 자산 — 서로 다른 Provider의 자산을 한 요청에 섞는 계약을 검증한다. */
const AAPL: Instrument = {
  id: "stock-aapl",
  symbol: "AAPL",
  displayName: "Apple Inc.",
  assetClass: "stock",
  market: "NASDAQ",
  quoteCurrency: "USD",
  exchangeTimezone: "America/New_York",
  providerId: "fake-2",
  providerSymbol: "aapl",
  status: "active",
};

function tradingDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function makeCandle(providerId: string, instrumentId: string, openTimeUtcMs: number): Candle {
  return {
    instrumentId,
    interval: "1d",
    openTimeUtcMs,
    closeTimeUtcMs: openTimeUtcMs + DAY_MS - 1,
    tradingDate: tradingDate(openTimeUtcMs),
    open: "100",
    high: "110",
    low: "90",
    close: "100",
    quoteCurrency: "USDT",
    source: {
      providerId,
      providerSymbol: instrumentId,
      fetchedAtUtcMs: RANGE_END,
      priceBasis: "raw",
    },
  };
}

interface FakeProviderOptions {
  readonly id?: string;
  /** instrumentId -> 이 시각 이전 캔들은 생성하지 않는다 (상장 전 시뮬레이션) */
  readonly listedFromMs?: Readonly<Record<string, number>>;
  /** instrumentId -> 이 openTimeUtcMs 집합은 캔들을 건너뛴다 (중간 누락 시뮬레이션) */
  readonly skipOpenTimes?: Readonly<Record<string, readonly number[]>>;
  /** 이 instrumentId는 항상 빈 배열을 반환한다 (데이터 완전 없음 시뮬레이션) */
  readonly noDataInstrumentIds?: readonly string[];
  readonly failInstrumentIds?: readonly string[];
}

class FakeProvider implements MarketDataProvider {
  readonly id: string;
  constructor(private readonly options: FakeProviderOptions = {}) {
    this.id = options.id ?? "fake";
  }

  searchInstruments(): Promise<Instrument[]> {
    return Promise.resolve([]);
  }

  getCandles(query: CandleQuery): Promise<ProviderCandleBatch> {
    const instrumentId = query.instrument.id;
    if (this.options.failInstrumentIds?.includes(instrumentId)) {
      return Promise.reject(new ProviderNetworkError(this.id, "네트워크 실패 (테스트)"));
    }
    if (this.options.noDataInstrumentIds?.includes(instrumentId)) {
      return Promise.resolve({
        providerId: this.id,
        candles: [],
        requestedRange: query.range,
        completeRange: query.range,
        fetchedAtUtcMs: RANGE_END,
      });
    }
    const listedFromMs = this.options.listedFromMs?.[instrumentId] ?? -Infinity;
    const skip = new Set(this.options.skipOpenTimes?.[instrumentId] ?? []);
    const candles: Candle[] = [];
    for (let ms = query.range.startMs; ms < query.range.endMs; ms += DAY_MS) {
      if (ms < listedFromMs || skip.has(ms)) {
        continue;
      }
      candles.push(makeCandle(this.id, instrumentId, ms));
    }
    return Promise.resolve({
      providerId: this.id,
      candles,
      requestedRange: query.range,
      completeRange: query.range,
      fetchedAtUtcMs: RANGE_END,
    });
  }
}

/** 최소 in-memory 캐시. 실제 SQLite 계약 검증은 M2에서 이미 완료했으므로 여기선 단순 fake로 충분하다. */
class InMemoryFakeRepository implements CandleRepository {
  private readonly candles: Candle[] = [];
  private readonly coverage: (UtcTimeRange & { readonly instrumentId: string })[] = [];

  findRange(query: CandleRangeQuery): Promise<CandleRangeResult> {
    return Promise.resolve({
      candles: this.candles.filter(
        (c) =>
          c.instrumentId === query.instrumentId &&
          c.openTimeUtcMs >= query.range.startMs &&
          c.openTimeUtcMs < query.range.endMs,
      ),
      coveredRanges: this.coverage
        .filter(
          (r) =>
            r.instrumentId === query.instrumentId &&
            r.endMs > query.range.startMs &&
            r.startMs < query.range.endMs,
        )
        .map((r) => ({ startMs: r.startMs, endMs: r.endMs })),
    });
  }

  upsertBatch(batch: CandleBatch): Promise<void> {
    this.candles.push(...batch.candles);
    this.coverage.push({ ...batch.coveredRange, instrumentId: batch.instrumentId });
    return Promise.resolve();
  }
}

/** providerId -> provider 맵으로 감싼다 (multi-provider composition, M7). */
function providersOf(
  ...providers: readonly MarketDataProvider[]
): ReadonlyMap<string, MarketDataProvider> {
  return new Map(providers.map((provider) => [provider.id, provider]));
}

function lumpSum(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    mode: "lump-sum",
    initialCash: { amount: "1000", currency: "USDT" },
    executionPrice: "close",
    feeRate: "0",
    allowFractionalQuantity: true,
    dividendPolicy: "ignore",
    ...overrides,
  };
}

function fullRange(): UtcTimeRange {
  return { startMs: RANGE_START, endMs: RANGE_END };
}

describe("prepareReplaySession — 정상 경로", () => {
  it("단일 자산: 데이터셋과 시뮬레이션 결과를 만든다", async () => {
    const deps = {
      providers: providersOf(new FakeProvider()),
      repository: new InMemoryFakeRepository(),
    };
    const result = await prepareReplaySession(deps, {
      selections: [{ instrument: BTC, simulationConfig: lumpSum() }],
      range: fullRange(),
    });

    expect(result.dataset.timeline).toHaveLength(10);
    expect(result.resultsByInstrumentId[BTC.id].snapshots).toHaveLength(10);
    expect(result.dataNoticesByInstrumentId[BTC.id]).toEqual({
      hasNoData: false,
      hasPreListingGap: false,
      hasInteriorGap: false,
    });
  });

  it("2개 자산: 서로 다른 투자 규칙을 각자 적용한다", async () => {
    const deps = {
      providers: providersOf(new FakeProvider()),
      repository: new InMemoryFakeRepository(),
    };
    const selections: AssetSelection[] = [
      {
        instrument: BTC,
        simulationConfig: lumpSum({ initialCash: { amount: "1000", currency: "USDT" } }),
      },
      {
        instrument: ETH,
        simulationConfig: {
          mode: "dca",
          initialCash: { amount: "0", currency: "USDT" },
          recurring: {
            amount: { amount: "50", currency: "USDT" },
            frequency: "weekly",
            anchor: { kind: "day-of-week", isoDayOfWeek: 3 },
          },
          executionPrice: "close",
          feeRate: "0",
          allowFractionalQuantity: true,
          dividendPolicy: "ignore",
        },
      },
    ];
    const result = await prepareReplaySession(deps, { selections, range: fullRange() });

    expect(Object.keys(result.resultsByInstrumentId)).toEqual([BTC.id, ETH.id]);
    expect(result.resultsByInstrumentId[BTC.id].trades[0].reason).toBe("initial");
    expect(result.resultsByInstrumentId[ETH.id].trades.every((t) => t.reason === "scheduled")).toBe(
      true,
    );
  });

  it("서로 다른 Provider 소속 자산을 한 요청에서 함께 조회한다 (crypto + stock, M7)", async () => {
    const deps = {
      providers: providersOf(new FakeProvider(), new FakeProvider({ id: "fake-2" })),
      repository: new InMemoryFakeRepository(),
    };
    const result = await prepareReplaySession(deps, {
      selections: [
        { instrument: BTC, simulationConfig: lumpSum() },
        {
          instrument: AAPL,
          simulationConfig: lumpSum({ initialCash: { amount: "500", currency: "USDT" } }),
        },
      ],
      range: fullRange(),
    });

    expect(Object.keys(result.resultsByInstrumentId)).toEqual([BTC.id, AAPL.id]);
    expect(result.resultsByInstrumentId[AAPL.id].snapshots).toHaveLength(10);
  });
});

describe("prepareReplaySession — 데이터 상태 판정", () => {
  // 타임라인은 "선택된 자산들"의 합집합이라, 자산을 1개만 선택하면 그 자산 자신의
  // 캔들 존재 여부가 곧 타임라인을 정의해 gap이 드러나지 않는다. gap을 관측하려면
  // 전체 구간을 커버하는 자산(ETH)을 함께 선택해야 한다.
  it("상장 이전 구간이 있으면 hasPreListingGap을 표시한다", async () => {
    const listedFromMs = RANGE_START + 5 * DAY_MS;
    const deps = {
      providers: providersOf(new FakeProvider({ listedFromMs: { [BTC.id]: listedFromMs } })),
      repository: new InMemoryFakeRepository(),
    };
    const result = await prepareReplaySession(deps, {
      selections: [
        { instrument: BTC, simulationConfig: lumpSum() },
        { instrument: ETH, simulationConfig: lumpSum() },
      ],
      range: fullRange(),
    });

    expect(result.dataNoticesByInstrumentId[BTC.id].hasPreListingGap).toBe(true);
    expect(result.dataNoticesByInstrumentId[BTC.id].hasNoData).toBe(false);
    expect(result.dataNoticesByInstrumentId[ETH.id].hasPreListingGap).toBe(false);
  });

  it("중간에 캔들이 없으면 hasInteriorGap을 표시한다 (carried-forward)", async () => {
    const skipMs = RANGE_START + 5 * DAY_MS;
    const deps = {
      providers: providersOf(new FakeProvider({ skipOpenTimes: { [BTC.id]: [skipMs] } })),
      repository: new InMemoryFakeRepository(),
    };
    const result = await prepareReplaySession(deps, {
      selections: [
        { instrument: BTC, simulationConfig: lumpSum() },
        { instrument: ETH, simulationConfig: lumpSum() },
      ],
      range: fullRange(),
    });

    expect(result.dataNoticesByInstrumentId[BTC.id].hasInteriorGap).toBe(true);
    expect(result.dataNoticesByInstrumentId[ETH.id].hasInteriorGap).toBe(false);
  });

  it("한 자산에 데이터가 전혀 없어도 다른 자산은 정상 판정된다", async () => {
    const deps = {
      providers: providersOf(new FakeProvider({ noDataInstrumentIds: [ETH.id] })),
      repository: new InMemoryFakeRepository(),
    };
    const result = await prepareReplaySession(deps, {
      selections: [
        { instrument: BTC, simulationConfig: lumpSum() },
        { instrument: ETH, simulationConfig: lumpSum() },
      ],
      range: fullRange(),
    });

    expect(result.dataNoticesByInstrumentId[ETH.id].hasNoData).toBe(true);
    expect(result.dataNoticesByInstrumentId[BTC.id].hasNoData).toBe(false);
  });
});

describe("prepareReplaySession — 오류", () => {
  it("자산 0개를 거부한다", async () => {
    const deps = {
      providers: providersOf(new FakeProvider()),
      repository: new InMemoryFakeRepository(),
    };
    await expect(
      prepareReplaySession(deps, { selections: [], range: fullRange() }),
    ).rejects.toThrow(DomainValidationError);
  });

  it("자산 3개는 허용한다", async () => {
    const deps = {
      providers: providersOf(new FakeProvider()),
      repository: new InMemoryFakeRepository(),
    };
    const third: Instrument = { ...BTC, id: "crypto-sol-usdt", symbol: "SOL/USDT" };
    const result = await prepareReplaySession(deps, {
      selections: [
        { instrument: BTC, simulationConfig: lumpSum() },
        { instrument: ETH, simulationConfig: lumpSum() },
        { instrument: third, simulationConfig: lumpSum() },
      ],
      range: fullRange(),
    });
    expect(Object.keys(result.resultsByInstrumentId)).toEqual([BTC.id, ETH.id, third.id]);
  });

  it("자산 4개 이상을 거부한다", async () => {
    const deps = {
      providers: providersOf(new FakeProvider(), new FakeProvider({ id: "fake-2" })),
      repository: new InMemoryFakeRepository(),
    };
    const third: Instrument = { ...BTC, id: "crypto-sol-usdt", symbol: "SOL/USDT" };
    await expect(
      prepareReplaySession(deps, {
        selections: [
          { instrument: BTC, simulationConfig: lumpSum() },
          { instrument: ETH, simulationConfig: lumpSum() },
          { instrument: third, simulationConfig: lumpSum() },
          { instrument: AAPL, simulationConfig: lumpSum() },
        ],
        range: fullRange(),
      }),
    ).rejects.toThrow(DomainValidationError);
  });

  it("같은 자산 중복 선택을 거부한다", async () => {
    const deps = {
      providers: providersOf(new FakeProvider()),
      repository: new InMemoryFakeRepository(),
    };
    await expect(
      prepareReplaySession(deps, {
        selections: [
          { instrument: BTC, simulationConfig: lumpSum() },
          { instrument: BTC, simulationConfig: lumpSum() },
        ],
        range: fullRange(),
      }),
    ).rejects.toThrow(DomainValidationError);
  });

  it("Provider 오류를 삼키지 않고 그대로 전파한다", async () => {
    const deps = {
      providers: providersOf(new FakeProvider({ failInstrumentIds: [BTC.id] })),
      repository: new InMemoryFakeRepository(),
    };
    await expect(
      prepareReplaySession(deps, {
        selections: [{ instrument: BTC, simulationConfig: lumpSum() }],
        range: fullRange(),
      }),
    ).rejects.toThrow(ProviderNetworkError);
  });

  it("요청 기간에 데이터가 전혀 없으면(단일 자산) 엔진이 빈 기간 오류를 던진다", async () => {
    const deps = {
      providers: providersOf(new FakeProvider({ noDataInstrumentIds: [BTC.id] })),
      repository: new InMemoryFakeRepository(),
    };
    await expect(
      prepareReplaySession(deps, {
        selections: [{ instrument: BTC, simulationConfig: lumpSum() }],
        range: fullRange(),
      }),
    ).rejects.toThrow(DomainValidationError);
  });

  it("선택한 자산의 Provider가 등록되지 않았으면 명확한 오류를 던진다", async () => {
    const deps = {
      providers: providersOf(new FakeProvider()),
      repository: new InMemoryFakeRepository(),
    };
    const unregistered: Instrument = { ...BTC, providerId: "not-registered" };
    await expect(
      prepareReplaySession(deps, {
        selections: [{ instrument: unregistered, simulationConfig: lumpSum() }],
        range: fullRange(),
      }),
    ).rejects.toThrow(DomainValidationError);
  });
});

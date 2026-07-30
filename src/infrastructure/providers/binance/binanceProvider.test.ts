import { describe, expect, it } from "vitest";

import type { Clock } from "../../../application/ports/clock";
import type { CandleQuery } from "../../../application/ports/marketDataProvider";
import {
  MarketDataProviderError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderResponseError,
} from "../../../application/ports/providerErrors";
import type { HttpClient, HttpResponse } from "../../http/httpClient";
import { BINANCE_INSTRUMENTS } from "./binanceCatalog";
import { BinanceProvider } from "./binanceProvider";

const DAY_MS = 86_400_000;
const JAN_1 = Date.UTC(2024, 0, 1);

/** Binance klines 행 fixture. 기본값은 유효한 캔들이다. */
function klineRow(openTimeMs: number, close = "105", overrides?: Partial<Record<number, unknown>>) {
  const row: unknown[] = [
    openTimeMs,
    "100",
    "110",
    "90",
    close,
    "1000",
    openTimeMs + DAY_MS - 1,
    "0",
    0,
    "0",
    "0",
    "0",
  ];
  if (overrides) {
    for (const [index, value] of Object.entries(overrides)) {
      row[Number(index)] = value;
    }
  }
  return row;
}

type FakeResponse =
  | { readonly kind: "ok"; readonly body: unknown }
  | {
      readonly kind: "status";
      readonly status: number;
      readonly body?: string;
      readonly headers?: Record<string, string>;
    }
  | { readonly kind: "network-error" };

/** 순서대로 응답을 소비하는 결정론적 HTTP 클라이언트. 요청 URL을 기록한다. */
class FakeHttpClient implements HttpClient {
  readonly requestedUrls: string[] = [];
  private readonly queue: FakeResponse[];

  constructor(responses: FakeResponse[]) {
    this.queue = [...responses];
  }

  get(url: string): Promise<HttpResponse> {
    this.requestedUrls.push(url);
    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error(`예상보다 많은 HTTP 요청: ${url}`);
    }
    if (next.kind === "network-error") {
      return Promise.reject(new TypeError("fetch failed"));
    }
    if (next.kind === "status") {
      const headers = next.headers ?? {};
      return Promise.resolve({
        status: next.status,
        body: next.body ?? "",
        header: (name) => headers[name] ?? null,
      });
    }
    return Promise.resolve({
      status: 200,
      body: JSON.stringify(next.body),
      header: () => null,
    });
  }
}

/** 2024-01-10T12:00:00Z 고정 시계 — 테스트 범위(1월 1~5일)가 전부 닫힌 과거가 된다. */
const fixedClock: Clock = { nowUtcMs: () => Date.UTC(2024, 0, 10, 12) };

const BTC = BINANCE_INSTRUMENTS[0];

function exchangeSymbol(
  symbol: string,
  baseAsset: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    symbol,
    status: "TRADING",
    baseAsset,
    quoteAsset: "USDT",
    isSpotTradingAllowed: true,
    ...overrides,
  };
}

function makeProvider(responses: FakeResponse[], clock: Clock = fixedClock) {
  const httpClient = new FakeHttpClient(responses);
  const provider = new BinanceProvider({
    httpClient,
    clock,
    maxAttempts: 3,
    baseDelayMs: 1,
    sleep: () => Promise.resolve(),
  });
  return { provider, httpClient };
}

function query(startDayOffset: number, endDayOffset: number): CandleQuery {
  return {
    instrument: BTC,
    interval: "1d",
    range: { startMs: JAN_1 + startDayOffset * DAY_MS, endMs: JAN_1 + endDayOffset * DAY_MS },
  };
}

describe("BinanceProvider.getCandles 정규화 계약", () => {
  it("정상 응답을 공통 Candle로 정규화한다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "ok", body: [klineRow(JAN_1), klineRow(JAN_1 + DAY_MS, "110")] },
    ]);
    const batch = await provider.getCandles(query(0, 2));

    expect(batch.candles).toHaveLength(2);
    expect(batch.candles[0]).toMatchObject({
      instrumentId: "crypto-btc-usdt",
      interval: "1d",
      openTimeUtcMs: JAN_1,
      closeTimeUtcMs: JAN_1 + DAY_MS - 1,
      tradingDate: "2024-01-01",
      open: "100",
      high: "110",
      low: "90",
      close: "105",
      volume: "1000",
      quoteCurrency: "USDT",
    });
    expect(batch.candles[0].source).toMatchObject({
      providerId: "binance",
      providerSymbol: "BTCUSDT",
      priceBasis: "raw",
      fetchedAtUtcMs: fixedClock.nowUtcMs(),
    });
    expect(batch.completeRange).toEqual(query(0, 2).range);
    expect(httpClient.requestedUrls[0]).toContain("symbol=BTCUSDT");
    expect(httpClient.requestedUrls[0]).toContain("interval=1d");
    expect(httpClient.requestedUrls[0]).toContain(`startTime=${JAN_1}`);
    expect(httpClient.requestedUrls[0]).toContain(`endTime=${JAN_1 + 2 * DAY_MS - 1}`);
  });

  it("요청 범위 밖의 데이터를 절단한다", async () => {
    const { provider } = makeProvider([
      {
        kind: "ok",
        body: [klineRow(JAN_1 - DAY_MS), klineRow(JAN_1), klineRow(JAN_1 + 2 * DAY_MS)],
      },
    ]);
    const batch = await provider.getCandles(query(0, 2));
    expect(batch.candles.map((candle) => candle.openTimeUtcMs)).toEqual([JAN_1]);
  });

  it("역순 응답을 오름차순으로 정렬한다", async () => {
    const { provider } = makeProvider([
      {
        kind: "ok",
        body: [klineRow(JAN_1 + 2 * DAY_MS), klineRow(JAN_1 + DAY_MS), klineRow(JAN_1)],
      },
    ]);
    const batch = await provider.getCandles(query(0, 3));
    expect(batch.candles.map((candle) => candle.tradingDate)).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
  });

  it("중복 캔들을 제거한다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: [klineRow(JAN_1), klineRow(JAN_1, "108")] },
    ]);
    const batch = await provider.getCandles(query(0, 1));
    expect(batch.candles).toHaveLength(1);
    expect(batch.candles[0].close).toBe("108");
  });

  it("잘못된 숫자를 거부한다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: [klineRow(JAN_1, "105", { 1: "not-a-number" })] },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderResponseError);
  });

  it("숫자형 가격(문자열 아님)을 거부한다", async () => {
    const { provider } = makeProvider([{ kind: "ok", body: [klineRow(JAN_1, "105", { 4: 105 })] }]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderResponseError);
  });

  it("OHLC 불변조건을 위반한 응답을 거부한다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: [klineRow(JAN_1, "105", { 2: "50" })] }, // high < close
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderResponseError);
  });

  it("빈 결과를 오류가 아니라 빈 배치로 반환한다 (상장 이전 기간)", async () => {
    const { provider } = makeProvider([{ kind: "ok", body: [] }]);
    const batch = await provider.getCandles(query(0, 2));
    expect(batch.candles).toEqual([]);
    expect(batch.completeRange).toEqual(query(0, 2).range);
  });

  it("UTC 자정 경계의 openTime이 올바른 거래일이 된다", async () => {
    const { provider } = makeProvider([{ kind: "ok", body: [klineRow(JAN_1)] }]);
    const batch = await provider.getCandles(query(0, 1));
    expect(batch.candles[0].tradingDate).toBe("2024-01-01");
  });
});

describe("BinanceProvider 페이지네이션", () => {
  it("가득 찬 페이지 뒤를 이어서 요청하고 결합한다", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => klineRow(JAN_1 + i * DAY_MS));
    const page2 = [klineRow(JAN_1 + 1000 * DAY_MS), klineRow(JAN_1 + 1001 * DAY_MS)];
    const { provider, httpClient } = makeProvider(
      [
        { kind: "ok", body: page1 },
        { kind: "ok", body: page2 },
      ],
      { nowUtcMs: () => JAN_1 + 2000 * DAY_MS },
    );

    const batch = await provider.getCandles(query(0, 1002));
    expect(batch.candles).toHaveLength(1002);
    expect(httpClient.requestedUrls).toHaveLength(2);
    expect(httpClient.requestedUrls[1]).toContain(`startTime=${JAN_1 + 999 * DAY_MS + 1}`);
  });

  it("전진하지 않는 페이지네이션을 오류로 감지한다 (무한 루프 방지)", async () => {
    const fullPageBefore = Array.from({ length: 1000 }, () => klineRow(JAN_1 - 5 * DAY_MS));
    const { provider } = makeProvider([{ kind: "ok", body: fullPageBefore }]);
    await expect(provider.getCandles(query(3, 1500))).rejects.toThrow(ProviderResponseError);
  });
});

describe("BinanceProvider 미완성 캔들 처리", () => {
  it("진행 중인 오늘(UTC) 캔들을 제외하고 커버리지를 닫힌 날까지만 주장한다", async () => {
    const noonJan3: Clock = { nowUtcMs: () => Date.UTC(2024, 0, 3, 12) };
    const { provider, httpClient } = makeProvider(
      [{ kind: "ok", body: [klineRow(JAN_1), klineRow(JAN_1 + DAY_MS)] }],
      noonJan3,
    );
    const batch = await provider.getCandles(query(0, 5));

    expect(batch.candles.map((candle) => candle.tradingDate)).toEqual(["2024-01-01", "2024-01-02"]);
    expect(batch.completeRange).toEqual({ startMs: JAN_1, endMs: Date.UTC(2024, 0, 3) });
    expect(httpClient.requestedUrls[0]).toContain(`endTime=${Date.UTC(2024, 0, 3) - 1}`);
  });

  it("전부 미래인 범위는 HTTP 요청 없이 빈 배치와 null 커버리지를 반환한다", async () => {
    const { provider, httpClient } = makeProvider([], fixedClock);
    const batch = await provider.getCandles(query(30, 40));
    expect(batch.candles).toEqual([]);
    expect(batch.completeRange).toBeNull();
    expect(httpClient.requestedUrls).toEqual([]);
  });
});

describe("BinanceProvider 오류 분류와 재시도", () => {
  it("429는 Retry-After를 준수해 재시도하고 성공하면 결과를 반환한다", async () => {
    const sleeps: number[] = [];
    const httpClient = new FakeHttpClient([
      { kind: "status", status: 429, headers: { "Retry-After": "2" } },
      { kind: "ok", body: [klineRow(JAN_1)] },
    ]);
    const provider = new BinanceProvider({
      httpClient,
      clock: fixedClock,
      maxAttempts: 3,
      baseDelayMs: 1,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });

    const batch = await provider.getCandles(query(0, 1));
    expect(batch.candles).toHaveLength(1);
    expect(sleeps).toEqual([2000]);
  });

  it("429가 계속되면 ProviderRateLimitError로 실패한다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "status", status: 429 },
      { kind: "status", status: 429 },
      { kind: "status", status: 429 },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderRateLimitError);
    expect(httpClient.requestedUrls).toHaveLength(3);
  });

  it("418(IP ban)은 재시도하지 않고 즉시 실패한다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "status", status: 418, headers: { "Retry-After": "120" } },
    ]);
    const failure = provider.getCandles(query(0, 1));
    await expect(failure).rejects.toThrow(ProviderRateLimitError);
    await failure.catch((error: unknown) => {
      expect(error).toBeInstanceOf(ProviderRateLimitError);
      if (error instanceof ProviderRateLimitError) {
        expect(error.banned).toBe(true);
        expect(error.retryAfterMs).toBe(120_000);
      }
    });
    expect(httpClient.requestedUrls).toHaveLength(1);
  });

  it("네트워크 오류는 재시도 후 성공할 수 있다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "network-error" },
      { kind: "ok", body: [klineRow(JAN_1)] },
    ]);
    const batch = await provider.getCandles(query(0, 1));
    expect(batch.candles).toHaveLength(1);
    expect(httpClient.requestedUrls).toHaveLength(2);
  });

  it("네트워크 오류가 계속되면 ProviderNetworkError로 실패한다", async () => {
    const { provider } = makeProvider([
      { kind: "network-error" },
      { kind: "network-error" },
      { kind: "network-error" },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderNetworkError);
  });

  it("5xx는 재시도하고, 4xx(429/418 외)는 즉시 실패한다", async () => {
    const { provider: recovering, httpClient: recoveringClient } = makeProvider([
      { kind: "status", status: 503 },
      { kind: "ok", body: [klineRow(JAN_1)] },
    ]);
    await expect(recovering.getCandles(query(0, 1))).resolves.toBeDefined();
    expect(recoveringClient.requestedUrls).toHaveLength(2);

    const { provider: rejected, httpClient: rejectedClient } = makeProvider([
      { kind: "status", status: 400, body: '{"code":-1121,"msg":"Invalid symbol."}' },
    ]);
    await expect(rejected.getCandles(query(0, 1))).rejects.toThrow(MarketDataProviderError);
    expect(rejectedClient.requestedUrls).toHaveLength(1);
  });

  it("JSON이 아닌 응답은 재시도 없이 ProviderResponseError다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "status", status: 200, body: "<html>maintenance</html>" },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderResponseError);
    expect(httpClient.requestedUrls).toHaveLength(1);
  });

  it("다른 Provider의 자산 요청을 거부한다", async () => {
    const { provider } = makeProvider([]);
    const foreign = { ...BTC, providerId: "other-provider" };
    await expect(
      provider.getCandles({ instrument: foreign, interval: "1d", range: query(0, 1).range }),
    ).rejects.toThrow(MarketDataProviderError);
  });
});

describe("BinanceProvider.searchInstruments", () => {
  it("공개 exchangeInfo에서 활성 USDT 현물 전체를 동적 카탈로그로 만든다", async () => {
    const { provider, httpClient } = makeProvider([
      {
        kind: "ok",
        body: {
          symbols: [
            exchangeSymbol("BTCUSDT", "BTC"),
            exchangeSymbol("ETHUSDT", "ETH"),
            exchangeSymbol("DOGEUSDT", "DOGE"),
            exchangeSymbol("BTCUSDC", "BTC", { quoteAsset: "USDC" }),
            exchangeSymbol("OLDUSDT", "OLD", { status: "BREAK" }),
            exchangeSymbol("NOSPOTUSDT", "NOSPOT", { isSpotTradingAllowed: false }),
          ],
        },
      },
    ]);

    const instruments = await provider.searchInstruments("");

    expect(instruments.map((instrument) => instrument.providerSymbol)).toEqual([
      "BTCUSDT",
      "ETHUSDT",
      "DOGEUSDT",
    ]);
    expect(instruments[0]).toMatchObject({
      id: "crypto-btc-usdt",
      symbol: "BTC/USDT",
      displayName: "Bitcoin",
      quoteCurrency: "USDT",
      providerId: "binance",
    });
    expect(instruments[2]).toMatchObject({
      id: "crypto-doge-usdt",
      symbol: "DOGE/USDT",
      displayName: "DOGE",
    });
    expect(httpClient.requestedUrls[0]).toContain("/api/v3/exchangeInfo?");
    expect(httpClient.requestedUrls[0]).toContain("permissions=SPOT");
    expect(httpClient.requestedUrls[0]).toContain("symbolStatus=TRADING");
  });

  it("동적 카탈로그를 심볼·이름·공급자 심볼로 검색하고 TTL 동안 재사용한다", async () => {
    const { provider, httpClient } = makeProvider([
      {
        kind: "ok",
        body: {
          symbols: [
            exchangeSymbol("BTCUSDT", "BTC"),
            exchangeSymbol("ETHUSDT", "ETH"),
            exchangeSymbol("SOLUSDT", "SOL"),
            exchangeSymbol("DOGEUSDT", "DOGE"),
          ],
        },
      },
    ]);

    await expect(provider.searchInstruments("btc")).resolves.toHaveLength(1);
    await expect(provider.searchInstruments("Ethereum")).resolves.toHaveLength(1);
    await expect(provider.searchInstruments("SOLUSDT")).resolves.toHaveLength(1);
    await expect(provider.searchInstruments("doge")).resolves.toHaveLength(1);
    expect(httpClient.requestedUrls).toHaveLength(1);
  });

  it("동시에 시작한 검색은 exchangeInfo 요청 하나를 공유한다", async () => {
    const { provider, httpClient } = makeProvider([
      {
        kind: "ok",
        body: { symbols: [exchangeSymbol("BTCUSDT", "BTC"), exchangeSymbol("DOGEUSDT", "DOGE")] },
      },
    ]);

    const [btc, doge] = await Promise.all([
      provider.searchInstruments("btc"),
      provider.searchInstruments("doge"),
    ]);

    expect(btc).toHaveLength(1);
    expect(doge).toHaveLength(1);
    expect(httpClient.requestedUrls).toHaveLength(1);
  });

  it("exchangeInfo 스키마가 잘못되면 부분 카탈로그로 위장하지 않는다", async () => {
    const { provider } = makeProvider([
      {
        kind: "ok",
        body: {
          symbols: [exchangeSymbol("BTCUSDT", "BTC"), { symbol: "BROKENUSDT" }],
        },
      },
    ]);

    await expect(provider.searchInstruments("")).rejects.toThrow(ProviderResponseError);
  });
});

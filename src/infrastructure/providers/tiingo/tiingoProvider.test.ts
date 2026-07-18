import { describe, expect, it } from "vitest";

import type { Clock } from "../../../application/ports/clock";
import type { CandleQuery } from "../../../application/ports/marketDataProvider";
import {
  MarketDataProviderError,
  ProviderAuthError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderResponseError,
} from "../../../application/ports/providerErrors";
import type { HttpClient, HttpResponse } from "../../http/httpClient";
import { TIINGO_INSTRUMENTS } from "./tiingoCatalog";
import { TiingoProvider } from "./tiingoProvider";

const DAY_MS = 86_400_000;
const JAN_1 = Date.UTC(2024, 0, 1);

/** Tiingo EOD 행 fixture. 기본값은 유효한 캔들이다. */
function row(dateMs: number, overrides: Record<string, unknown> = {}) {
  return {
    date: new Date(dateMs).toISOString(),
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1000,
    adjOpen: 100,
    adjHigh: 110,
    adjLow: 90,
    adjClose: 105,
    adjVolume: 1000,
    divCash: 0,
    splitFactor: 1,
    ...overrides,
  };
}

type FakeResponse =
  | { readonly kind: "ok"; readonly body: unknown }
  | { readonly kind: "status"; readonly status: number; readonly body?: string }
  | { readonly kind: "network-error" };

/** 순서대로 응답을 소비하는 결정론적 HTTP 클라이언트. 요청 URL·헤더를 기록한다. */
class FakeHttpClient implements HttpClient {
  readonly requestedUrls: string[] = [];
  readonly requestedHeaders: (Readonly<Record<string, string>> | undefined)[] = [];
  private readonly queue: FakeResponse[];

  constructor(responses: FakeResponse[]) {
    this.queue = [...responses];
  }

  get(url: string, headers?: Readonly<Record<string, string>>): Promise<HttpResponse> {
    this.requestedUrls.push(url);
    this.requestedHeaders.push(headers);
    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error(`예상보다 많은 HTTP 요청: ${url}`);
    }
    if (next.kind === "network-error") {
      return Promise.reject(new TypeError("fetch failed"));
    }
    if (next.kind === "status") {
      return Promise.resolve({ status: next.status, body: next.body ?? "", header: () => null });
    }
    return Promise.resolve({ status: 200, body: JSON.stringify(next.body), header: () => null });
  }
}

/** 2024-01-10T12:00:00Z 고정 시계 — 테스트 범위(1월 1~5일)가 전부 닫힌 과거가 된다. */
const fixedClock: Clock = { nowUtcMs: () => Date.UTC(2024, 0, 10, 12) };

const AAPL = TIINGO_INSTRUMENTS[0];

function makeProvider(
  responses: FakeResponse[],
  options: { clock?: Clock; apiKey?: string | null } = {},
) {
  const httpClient = new FakeHttpClient(responses);
  const provider = new TiingoProvider({
    httpClient,
    getApiKey: () => (options.apiKey === undefined ? "test-key" : options.apiKey),
    clock: options.clock ?? fixedClock,
    maxAttempts: 3,
    baseDelayMs: 1,
    sleep: () => Promise.resolve(),
  });
  return { provider, httpClient };
}

function query(startDayOffset: number, endDayOffset: number): CandleQuery {
  return {
    instrument: AAPL,
    interval: "1d",
    range: { startMs: JAN_1 + startDayOffset * DAY_MS, endMs: JAN_1 + endDayOffset * DAY_MS },
  };
}

describe("TiingoProvider.getCandles 정규화 계약", () => {
  it("정상 응답을 공통 Candle로 정규화한다 (원시가+수정종가)", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "ok", body: [row(JAN_1), row(JAN_1 + DAY_MS, { close: 110, adjClose: 109.5 })] },
    ]);
    const batch = await provider.getCandles(query(0, 2));

    expect(batch.candles).toHaveLength(2);
    expect(batch.candles[0]).toMatchObject({
      instrumentId: "stock-aapl",
      interval: "1d",
      tradingDate: "2024-01-01",
      open: "100",
      high: "110",
      low: "90",
      close: "105",
      adjustedClose: "105",
      volume: "1000",
      quoteCurrency: "USD",
    });
    expect(batch.candles[1].close).toBe("110");
    expect(batch.candles[1].adjustedClose).toBe("109.5");
    expect(batch.candles[0].source).toMatchObject({
      providerId: "tiingo",
      providerSymbol: "aapl",
      priceBasis: "raw",
    });
    expect(batch.completeRange).toEqual(query(0, 2).range);
    expect(httpClient.requestedUrls[0]).toContain("/tiingo/daily/aapl/prices");
    expect(httpClient.requestedUrls[0]).toContain("startDate=2024-01-01");
    expect(httpClient.requestedHeaders[0]).toEqual({ Authorization: "Token test-key" });
  });

  it("요청 범위 밖의 데이터를 절단한다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: [row(JAN_1 - DAY_MS), row(JAN_1), row(JAN_1 + 2 * DAY_MS)] },
    ]);
    const batch = await provider.getCandles(query(0, 2));
    expect(batch.candles.map((c) => c.tradingDate)).toEqual(["2024-01-01"]);
  });

  it("역순 응답을 오름차순으로 정렬한다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: [row(JAN_1 + 2 * DAY_MS), row(JAN_1 + DAY_MS), row(JAN_1)] },
    ]);
    const batch = await provider.getCandles(query(0, 3));
    expect(batch.candles.map((c) => c.tradingDate)).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
  });

  it("중복 캔들을 제거한다 (같은 날짜, 마지막 관측 우선)", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: [row(JAN_1, { close: 100 }), row(JAN_1, { close: 108 })] },
    ]);
    const batch = await provider.getCandles(query(0, 1));
    expect(batch.candles).toHaveLength(1);
    expect(batch.candles[0].close).toBe("108");
  });

  it("잘못된 숫자를 거부한다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: [row(JAN_1, { open: "not-a-number" })] },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderResponseError);
  });

  it("OHLC 불변조건을 위반한 응답을 거부한다", async () => {
    const { provider } = makeProvider([{ kind: "ok", body: [row(JAN_1, { high: 50 })] }]); // high < close
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderResponseError);
  });

  it("빈 결과를 오류가 아니라 빈 배치로 반환한다 (상장 이전 기간)", async () => {
    const { provider } = makeProvider([{ kind: "ok", body: [] }]);
    const batch = await provider.getCandles(query(0, 2));
    expect(batch.candles).toEqual([]);
    expect(batch.completeRange).toEqual(query(0, 2).range);
  });

  it("adjClose가 없으면 adjustedClose는 undefined다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: [row(JAN_1, { adjClose: undefined })] },
    ]);
    const batch = await provider.getCandles(query(0, 1));
    expect(batch.candles[0].adjustedClose).toBeUndefined();
  });
});

describe("TiingoProvider 미완성 캔들 처리", () => {
  it("진행 중인 오늘(UTC)을 제외하고 커버리지를 닫힌 날까지만 주장한다", async () => {
    const noonJan3: Clock = { nowUtcMs: () => Date.UTC(2024, 0, 3, 12) };
    const { provider, httpClient } = makeProvider(
      [{ kind: "ok", body: [row(JAN_1), row(JAN_1 + DAY_MS)] }],
      { clock: noonJan3 },
    );
    const batch = await provider.getCandles(query(0, 5));
    expect(batch.candles.map((c) => c.tradingDate)).toEqual(["2024-01-01", "2024-01-02"]);
    expect(batch.completeRange).toEqual({ startMs: JAN_1, endMs: Date.UTC(2024, 0, 3) });
    expect(httpClient.requestedUrls[0]).toContain("endDate=2024-01-02");
  });

  it("전부 미래인 범위는 HTTP 요청 없이 빈 배치와 null 커버리지를 반환한다", async () => {
    const { provider, httpClient } = makeProvider([]);
    const batch = await provider.getCandles(query(30, 40));
    expect(batch.candles).toEqual([]);
    expect(batch.completeRange).toBeNull();
    expect(httpClient.requestedUrls).toEqual([]);
  });
});

describe("TiingoProvider BYOK 인증", () => {
  it("API 키가 없으면 네트워크 요청 없이 ProviderAuthError를 던진다", async () => {
    const { provider, httpClient } = makeProvider([], { apiKey: null });
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderAuthError);
    expect(httpClient.requestedUrls).toEqual([]);
  });

  it("403은 재시도 없이 ProviderAuthError로 실패한다 (잘못된 키)", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "status", status: 403, body: '{"detail":"Invalid token."}' },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderAuthError);
    expect(httpClient.requestedUrls).toHaveLength(1);
  });
});

describe("TiingoProvider 오류 분류와 재시도", () => {
  it("HTTP 200과 평문 할당량 초과 문구는 재시도 없이 ProviderRateLimitError다", async () => {
    const { provider, httpClient } = makeProvider([
      {
        kind: "status",
        status: 200,
        body: "You have run over your 500 symbol look up for this month. Please upgrade at https://api.tiingo.com/pricing to have your limits increased.",
      },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderRateLimitError);
    expect(httpClient.requestedUrls).toHaveLength(1);
  });

  it("JSON이 아니고 할당량 문구도 아니면 ProviderResponseError다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "status", status: 200, body: "<html>maintenance</html>" },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderResponseError);
    expect(httpClient.requestedUrls).toHaveLength(1);
  });

  it("5xx는 재시도하고 성공하면 결과를 반환한다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "status", status: 503 },
      { kind: "ok", body: [row(JAN_1)] },
    ]);
    await expect(provider.getCandles(query(0, 1))).resolves.toBeDefined();
    expect(httpClient.requestedUrls).toHaveLength(2);
  });

  it("네트워크 오류는 재시도 후 성공할 수 있다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "network-error" },
      { kind: "ok", body: [row(JAN_1)] },
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

  it("다른 Provider의 자산 요청을 거부한다", async () => {
    const { provider } = makeProvider([]);
    const foreign = { ...AAPL, providerId: "other-provider" };
    await expect(
      provider.getCandles({ instrument: foreign, interval: "1d", range: query(0, 1).range }),
    ).rejects.toThrow(MarketDataProviderError);
  });
});

describe("TiingoProvider.searchInstruments", () => {
  it("빈 질의는 전체 카탈로그를 반환한다", async () => {
    const { provider } = makeProvider([]);
    await expect(provider.searchInstruments("")).resolves.toHaveLength(TIINGO_INSTRUMENTS.length);
  });

  it("심볼·이름으로 검색한다", async () => {
    const { provider } = makeProvider([]);
    await expect(provider.searchInstruments("aapl")).resolves.toHaveLength(1);
    await expect(provider.searchInstruments("Microsoft")).resolves.toHaveLength(1);
    await expect(provider.searchInstruments("nope")).resolves.toHaveLength(0);
  });
});

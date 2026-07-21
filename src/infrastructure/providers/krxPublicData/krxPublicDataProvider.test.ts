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
import { KRX_PUBLIC_DATA_INSTRUMENTS } from "./krxPublicDataCatalog";
import { KrxPublicDataProvider } from "./krxPublicDataProvider";

const DAY_MS = 86_400_000;
const JAN_1 = Date.UTC(2024, 0, 1);

function basDt(dateMs: number): string {
  return new Date(dateMs).toISOString().slice(0, 10).split("-").join("");
}

/** data.go.kr item fixture. 기본값은 유효한 캔들이다. */
function item(dateMs: number, overrides: Record<string, unknown> = {}) {
  return {
    basDt: basDt(dateMs),
    srtnCd: "005930",
    itmsNm: "삼성전자",
    mkp: 70000,
    hipr: 71000,
    lopr: 69500,
    clpr: 70500,
    trqu: 12345678,
    ...overrides,
  };
}

function envelope(
  items: unknown[],
  options: { resultCode?: string; resultMsg?: string; totalCount?: number } = {},
) {
  return {
    response: {
      header: { resultCode: options.resultCode ?? "00", resultMsg: options.resultMsg ?? "OK" },
      body: {
        totalCount: options.totalCount ?? items.length,
        items: items.length === 0 ? "" : { item: items },
      },
    },
  };
}

type FakeResponse =
  | { readonly kind: "ok"; readonly body: unknown }
  | { readonly kind: "status"; readonly status: number; readonly body?: string }
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
      return Promise.resolve({ status: next.status, body: next.body ?? "", header: () => null });
    }
    return Promise.resolve({ status: 200, body: JSON.stringify(next.body), header: () => null });
  }
}

/** 2024-01-10T12:00:00Z 고정 시계 — 테스트 범위(1월 1~5일)가 전부 닫힌 과거가 된다. */
const fixedClock: Clock = { nowUtcMs: () => Date.UTC(2024, 0, 10, 12) };

const SAMSUNG = KRX_PUBLIC_DATA_INSTRUMENTS[0];

function makeProvider(
  responses: FakeResponse[],
  options: { clock?: Clock; apiKey?: string | null } = {},
) {
  const httpClient = new FakeHttpClient(responses);
  const provider = new KrxPublicDataProvider({
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
    instrument: SAMSUNG,
    interval: "1d",
    range: { startMs: JAN_1 + startDayOffset * DAY_MS, endMs: JAN_1 + endDayOffset * DAY_MS },
  };
}

describe("KrxPublicDataProvider.getCandles 정규화 계약", () => {
  it("정상 응답을 공통 Candle로 정규화한다 (수정주가 없음)", async () => {
    const { provider, httpClient } = makeProvider([
      {
        kind: "ok",
        body: envelope([item(JAN_1), item(JAN_1 + DAY_MS, { clpr: 71500, hipr: 72000 })]),
      },
    ]);
    const batch = await provider.getCandles(query(0, 2));

    expect(batch.candles).toHaveLength(2);
    expect(batch.candles[0]).toMatchObject({
      instrumentId: "stock-005930",
      interval: "1d",
      tradingDate: "2024-01-01",
      open: "70000",
      high: "71000",
      low: "69500",
      close: "70500",
      volume: "12345678",
      quoteCurrency: "KRW",
    });
    expect(batch.candles[0].adjustedClose).toBeUndefined();
    expect(batch.candles[1].close).toBe("71500");
    expect(batch.candles[0].source).toMatchObject({
      providerId: "krx-public-data",
      providerSymbol: "005930",
      priceBasis: "raw",
    });
    expect(batch.completeRange).toEqual(query(0, 2).range);
    expect(httpClient.requestedUrls[0]).toContain("likeSrtnCd=005930");
    expect(httpClient.requestedUrls[0]).toContain("beginBasDt=20240101");
    expect(httpClient.requestedUrls[0]).toContain("serviceKey=test-key");
  });

  it("요청 범위 밖의 데이터를 절단한다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: envelope([item(JAN_1 - DAY_MS), item(JAN_1), item(JAN_1 + 2 * DAY_MS)]) },
    ]);
    const batch = await provider.getCandles(query(0, 2));
    expect(batch.candles.map((c) => c.tradingDate)).toEqual(["2024-01-01"]);
  });

  it("역순 응답을 오름차순으로 정렬한다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: envelope([item(JAN_1 + 2 * DAY_MS), item(JAN_1 + DAY_MS), item(JAN_1)]) },
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
      { kind: "ok", body: envelope([item(JAN_1, { clpr: 70000 }), item(JAN_1, { clpr: 70800 })]) },
    ]);
    const batch = await provider.getCandles(query(0, 1));
    expect(batch.candles).toHaveLength(1);
    expect(batch.candles[0].close).toBe("70800");
  });

  it("likeSrtnCd 부분일치로 섞여 들어온 다른 종목 코드는 버린다", async () => {
    const { provider } = makeProvider([
      {
        kind: "ok",
        body: envelope([item(JAN_1, { srtnCd: "0059301" }), item(JAN_1 + DAY_MS)]),
      },
    ]);
    const batch = await provider.getCandles(query(0, 2));
    expect(batch.candles.map((c) => c.tradingDate)).toEqual(["2024-01-02"]);
  });

  it("잘못된 숫자를 거부한다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: envelope([item(JAN_1, { mkp: "not-a-number" })]) },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderResponseError);
  });

  it("OHLC 불변조건을 위반한 응답을 거부한다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: envelope([item(JAN_1, { hipr: 100 })]) },
    ]); // high < close
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderResponseError);
  });

  it("resultCode 03(NODATA)은 오류가 아니라 빈 배치다 (상장 이전 기간)", async () => {
    const { provider } = makeProvider([{ kind: "ok", body: envelope([], { resultCode: "03" }) }]);
    const batch = await provider.getCandles(query(0, 2));
    expect(batch.candles).toEqual([]);
    expect(batch.completeRange).toEqual(query(0, 2).range);
  });
});

describe("KrxPublicDataProvider 미완성 캔들 처리", () => {
  it("진행 중인 오늘(UTC)을 제외하고 커버리지를 닫힌 날까지만 주장한다", async () => {
    const noonJan3: Clock = { nowUtcMs: () => Date.UTC(2024, 0, 3, 12) };
    const { provider, httpClient } = makeProvider(
      [{ kind: "ok", body: envelope([item(JAN_1), item(JAN_1 + DAY_MS)]) }],
      { clock: noonJan3 },
    );
    const batch = await provider.getCandles(query(0, 5));
    expect(batch.candles.map((c) => c.tradingDate)).toEqual(["2024-01-01", "2024-01-02"]);
    expect(batch.completeRange).toEqual({ startMs: JAN_1, endMs: Date.UTC(2024, 0, 3) });
    expect(httpClient.requestedUrls[0]).toContain("endBasDt=20240102");
  });

  it("전부 미래인 범위는 HTTP 요청 없이 빈 배치와 null 커버리지를 반환한다", async () => {
    const { provider, httpClient } = makeProvider([]);
    const batch = await provider.getCandles(query(30, 40));
    expect(batch.candles).toEqual([]);
    expect(batch.completeRange).toBeNull();
    expect(httpClient.requestedUrls).toEqual([]);
  });
});

describe("KrxPublicDataProvider BYOK 인증", () => {
  it("API 키가 없으면 네트워크 요청 없이 ProviderAuthError를 던진다", async () => {
    const { provider, httpClient } = makeProvider([], { apiKey: null });
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderAuthError);
    expect(httpClient.requestedUrls).toEqual([]);
  });

  it("resultCode 30(키 미등록)은 재시도 없이 ProviderAuthError로 실패한다", async () => {
    const { provider, httpClient } = makeProvider([
      {
        kind: "ok",
        body: envelope([], {
          resultCode: "30",
          resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
        }),
      },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderAuthError);
    expect(httpClient.requestedUrls).toHaveLength(1);
  });
});

describe("KrxPublicDataProvider 오류 분류와 재시도", () => {
  it("resultCode 22(호출 한도 초과)는 재시도 없이 ProviderRateLimitError다", async () => {
    const { provider, httpClient } = makeProvider([
      {
        kind: "ok",
        body: envelope([], {
          resultCode: "22",
          resultMsg: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
        }),
      },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderRateLimitError);
    expect(httpClient.requestedUrls).toHaveLength(1);
  });

  it("resultCode가 없는 형식이면 ProviderResponseError다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "ok", body: { response: { body: {} } } },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderResponseError);
    expect(httpClient.requestedUrls).toHaveLength(1);
  });

  it("JSON이 아닌 응답은 ProviderResponseError다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "status", status: 200, body: "<html>maintenance</html>" },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderResponseError);
    expect(httpClient.requestedUrls).toHaveLength(1);
  });

  it("5xx는 재시도하고 성공하면 결과를 반환한다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "status", status: 503 },
      { kind: "ok", body: envelope([item(JAN_1)]) },
    ]);
    await expect(provider.getCandles(query(0, 1))).resolves.toBeDefined();
    expect(httpClient.requestedUrls).toHaveLength(2);
  });

  it("네트워크 오류는 재시도 후 성공할 수 있다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "network-error" },
      { kind: "ok", body: envelope([item(JAN_1)]) },
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

  it("재시도 소진 오류 메시지에 serviceKey 값이 남지 않는다 (docs/09 §2)", async () => {
    const { provider } = makeProvider([
      { kind: "network-error" },
      { kind: "network-error" },
      { kind: "network-error" },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toMatchObject({
      message: expect.not.stringContaining("test-key") as unknown,
    });
  });

  it("다른 Provider의 자산 요청을 거부한다", async () => {
    const { provider } = makeProvider([]);
    const foreign = { ...SAMSUNG, providerId: "other-provider" };
    await expect(
      provider.getCandles({ instrument: foreign, interval: "1d", range: query(0, 1).range }),
    ).rejects.toThrow(MarketDataProviderError);
  });
});

describe("KrxPublicDataProvider 페이지네이션", () => {
  it("totalCount가 한 페이지를 초과하면 다음 페이지를 이어서 요청한다", async () => {
    const page1Items = Array.from({ length: 2 }, (_, i) => item(JAN_1 + i * DAY_MS));
    const page2Items = [item(JAN_1 + 2 * DAY_MS)];
    const { provider, httpClient } = makeProvider([
      { kind: "ok", body: envelope(page1Items, { totalCount: 3 }) },
      { kind: "ok", body: envelope(page2Items, { totalCount: 3 }) },
    ]);
    const batch = await provider.getCandles(query(0, 3));
    expect(batch.candles).toHaveLength(3);
    expect(httpClient.requestedUrls[0]).toContain("pageNo=1");
    expect(httpClient.requestedUrls[1]).toContain("pageNo=2");
  });

  it("페이지네이션이 totalCount에 못 미치고 멈추면 ProviderResponseError다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: envelope([item(JAN_1)], { totalCount: 5 }) },
      { kind: "ok", body: envelope([], { totalCount: 5 }) },
    ]);
    await expect(provider.getCandles(query(0, 1))).rejects.toThrow(ProviderResponseError);
  });
});

describe("KrxPublicDataProvider.searchInstruments", () => {
  it("빈 질의는 전체 카탈로그를 반환한다", async () => {
    const { provider } = makeProvider([]);
    await expect(provider.searchInstruments("")).resolves.toHaveLength(
      KRX_PUBLIC_DATA_INSTRUMENTS.length,
    );
  });

  it("심볼·이름으로 검색한다", async () => {
    const { provider } = makeProvider([]);
    await expect(provider.searchInstruments("005930")).resolves.toHaveLength(1);
    await expect(provider.searchInstruments("삼성전자")).resolves.toHaveLength(1);
    await expect(provider.searchInstruments("nope")).resolves.toHaveLength(0);
  });
});

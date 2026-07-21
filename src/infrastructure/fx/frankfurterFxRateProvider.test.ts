import { describe, expect, it } from "vitest";

import type { Clock } from "../../application/ports/clock";
import { FxRateError } from "../../application/ports/fxRateProvider";
import type { HttpClient, HttpResponse } from "../http/httpClient";
import { FrankfurterFxRateProvider } from "./frankfurterFxRateProvider";

type FakeResponse =
  | { readonly kind: "ok"; readonly body: unknown }
  | { readonly kind: "status"; readonly status: number; readonly body?: string }
  | { readonly kind: "network-error" };

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

const fixedClock: Clock = { nowUtcMs: () => Date.UTC(2026, 6, 21, 12) };

function makeProvider(
  responses: FakeResponse[],
  options: { clock?: Clock; maxAgeMs?: number } = {},
) {
  const httpClient = new FakeHttpClient(responses);
  const provider = new FrankfurterFxRateProvider({
    httpClient,
    clock: options.clock ?? fixedClock,
    maxAgeMs: options.maxAgeMs,
  });
  return { provider, httpClient };
}

describe("FrankfurterFxRateProvider", () => {
  it("정상 응답을 UsdKrwRate로 정규화한다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "ok", body: { date: "2026-07-21", base: "USD", quote: "KRW", rate: 1482.6 } },
    ]);
    const rate = await provider.getUsdKrwRate();
    expect(rate.krwPerUsd).toBe("1482.6");
    expect(rate.asOfUtcMs).toBe(Date.UTC(2026, 6, 21));
    expect(httpClient.requestedUrls[0]).toBe("https://api.frankfurter.dev/v2/rate/USD/KRW");
  });

  it("maxAgeMs 안에서는 캐시된 값을 재사용하고 재요청하지 않는다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "ok", body: { date: "2026-07-21", base: "USD", quote: "KRW", rate: 1482.6 } },
    ]);
    await provider.getUsdKrwRate();
    const rate2 = await provider.getUsdKrwRate();
    expect(rate2.krwPerUsd).toBe("1482.6");
    expect(httpClient.requestedUrls).toHaveLength(1);
  });

  it("forceRefresh면 캐시를 무시하고 다시 요청한다", async () => {
    const { provider, httpClient } = makeProvider([
      { kind: "ok", body: { date: "2026-07-21", base: "USD", quote: "KRW", rate: 1482.6 } },
      { kind: "ok", body: { date: "2026-07-22", base: "USD", quote: "KRW", rate: 1490.1 } },
    ]);
    await provider.getUsdKrwRate();
    const rate2 = await provider.getUsdKrwRate({ forceRefresh: true });
    expect(rate2.krwPerUsd).toBe("1490.1");
    expect(httpClient.requestedUrls).toHaveLength(2);
  });

  it("rate가 0 이하이거나 숫자가 아니면 FxRateError(invalid-response)다", async () => {
    const { provider } = makeProvider([
      { kind: "ok", body: { date: "2026-07-21", base: "USD", quote: "KRW", rate: -1 } },
    ]);
    await expect(provider.getUsdKrwRate()).rejects.toThrow(FxRateError);
  });

  it("JSON이 아닌 응답은 FxRateError(invalid-response)다", async () => {
    const { provider } = makeProvider([{ kind: "status", status: 200, body: "not json" }]);
    await expect(provider.getUsdKrwRate()).rejects.toThrow(FxRateError);
  });

  it("5xx는 FxRateError(network)다", async () => {
    const { provider } = makeProvider([{ kind: "status", status: 503 }]);
    await expect(provider.getUsdKrwRate()).rejects.toMatchObject({ kind: "network" });
  });

  it("네트워크 오류는 FxRateError(network)다", async () => {
    const { provider } = makeProvider([{ kind: "network-error" }]);
    await expect(provider.getUsdKrwRate()).rejects.toMatchObject({ kind: "network" });
  });
});

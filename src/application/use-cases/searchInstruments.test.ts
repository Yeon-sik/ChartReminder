import { describe, expect, it } from "vitest";

import type { Instrument } from "../../domain/instrument/instrument";
import type { MarketDataProvider } from "../ports/marketDataProvider";
import { searchInstrumentsAcrossProviders } from "./searchInstruments";

function fakeProvider(id: string, results: Instrument[] | Error): MarketDataProvider {
  return {
    id,
    searchInstruments: () =>
      results instanceof Error ? Promise.reject(results) : Promise.resolve(results),
    getCandles: () => Promise.reject(new Error("not used")),
  };
}

function instrument(id: string, providerId: string): Instrument {
  return {
    id,
    symbol: id,
    displayName: id,
    assetClass: "stock",
    market: "TEST",
    quoteCurrency: "USD",
    exchangeTimezone: "UTC",
    providerId,
    providerSymbol: id,
    status: "active",
  };
}

describe("searchInstrumentsAcrossProviders", () => {
  it("모든 provider의 결과를 합친다", async () => {
    const providers = new Map([
      ["a", fakeProvider("a", [instrument("aapl", "a")])],
      ["b", fakeProvider("b", [instrument("btc", "b")])],
    ]);
    const result = await searchInstrumentsAcrossProviders(providers, "query");
    expect(result.instruments.map((i) => i.id)).toEqual(["aapl", "btc"]);
    expect(result.errorsByProviderId).toEqual({});
  });

  it("한 provider가 실패해도 다른 provider의 결과는 반환된다", async () => {
    const error = new Error("boom");
    const providers = new Map([
      ["a", fakeProvider("a", error)],
      ["b", fakeProvider("b", [instrument("btc", "b")])],
    ]);
    const result = await searchInstrumentsAcrossProviders(providers, "query");
    expect(result.instruments.map((i) => i.id)).toEqual(["btc"]);
    expect(result.errorsByProviderId).toEqual({ a: error });
  });

  it("모든 provider가 실패하면 결과는 비어 있고 오류가 모두 보존된다", async () => {
    const errorA = new Error("a-fail");
    const errorB = new Error("b-fail");
    const providers = new Map([
      ["a", fakeProvider("a", errorA)],
      ["b", fakeProvider("b", errorB)],
    ]);
    const result = await searchInstrumentsAcrossProviders(providers, "query");
    expect(result.instruments).toEqual([]);
    expect(result.errorsByProviderId).toEqual({ a: errorA, b: errorB });
  });

  it("provider가 없으면 빈 결과를 반환한다", async () => {
    const result = await searchInstrumentsAcrossProviders(new Map(), "query");
    expect(result.instruments).toEqual([]);
    expect(result.errorsByProviderId).toEqual({});
  });
});

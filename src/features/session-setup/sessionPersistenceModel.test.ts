import { describe, expect, it } from "vitest";

import type { MarketDataProvider } from "../../application/ports/marketDataProvider";
import type { PrepareReplaySessionRequest } from "../../application/use-cases/prepareReplaySession";
import type { Instrument } from "../../domain/instrument/instrument";
import type { ReplaySessionRecord } from "../../domain/session/replaySession";
import { DomainValidationError } from "../../domain/shared/errors";
import { BINANCE_INSTRUMENTS } from "../../infrastructure/providers/binance/binanceCatalog";
import {
  buildCatalogForRecord,
  buildSavedSessionConfiguration,
  restoreSessionFromRecord,
} from "./sessionPersistenceModel";

const BTC = BINANCE_INSTRUMENTS[0];
const CATALOG = Object.fromEntries(BINANCE_INSTRUMENTS.map((i) => [i.id, i]));

const SIM_CONFIG = {
  mode: "lump-sum" as const,
  initialCash: { amount: "1000", currency: "USDT" },
  executionPrice: "close" as const,
  feeRate: "0",
  allowFractionalQuantity: true,
  dividendPolicy: "ignore" as const,
};

describe("buildSavedSessionConfiguration", () => {
  it("요청·표시기준·속도를 저장 가능한 구조로 직렬화한다", () => {
    const request: PrepareReplaySessionRequest = {
      selections: [{ instrument: BTC, simulationConfig: SIM_CONFIG }],
      range: { startMs: 0, endMs: 86_400_000 },
    };

    const configuration = buildSavedSessionConfiguration(request, "normalized-100", 2);

    expect(configuration).toEqual({
      assets: [
        {
          instrumentId: BTC.id,
          providerId: BTC.providerId,
          providerSymbol: BTC.providerSymbol,
          simulationConfig: SIM_CONFIG,
        },
      ],
      interval: "1d",
      range: { startMs: 0, endMs: 86_400_000 },
      displayMode: "normalized-100",
      replaySpeed: 2,
    });
  });
});

describe("restoreSessionFromRecord", () => {
  function makeRecord(instrumentId = BTC.id): ReplaySessionRecord {
    return {
      id: "session-1",
      name: "저장된 세션",
      schemaVersion: 1,
      configuration: {
        assets: [
          {
            instrumentId,
            providerId: BTC.providerId,
            providerSymbol: BTC.providerSymbol,
            simulationConfig: SIM_CONFIG,
          },
        ],
        interval: "1d",
        range: { startMs: 0, endMs: 86_400_000 },
        displayMode: "cumulative-return",
        replaySpeed: 5,
      },
      dataVersions: {},
      createdAtUtcMs: 0,
      updatedAtUtcMs: 0,
    };
  }

  it("카탈로그로 자산을 다시 연결해 요청을 재구성한다", () => {
    const restored = restoreSessionFromRecord(makeRecord(), CATALOG);

    expect(restored.request.selections).toEqual([
      { instrument: BTC, simulationConfig: SIM_CONFIG },
    ]);
    expect(restored.instrumentsById).toEqual({ [BTC.id]: BTC });
    expect(restored.displayMode).toBe("cumulative-return");
    expect(restored.replaySpeed).toBe(5);
  });

  it("카탈로그에 없는 자산이면 사용자 오류로 알린다", () => {
    expect(() => restoreSessionFromRecord(makeRecord("crypto-doge-usdt"), CATALOG)).toThrow(
      DomainValidationError,
    );
  });

  describe("buildCatalogForRecord (D-021 — 검색으로 골랐던 자산도 재로드)", () => {
    const AAPL: Instrument = {
      id: "stock-aapl",
      symbol: "AAPL",
      displayName: "Apple Inc.",
      assetClass: "stock",
      market: "US",
      quoteCurrency: "USD",
      exchangeTimezone: "America/New_York",
      providerId: "tiingo",
      providerSymbol: "aapl",
      status: "active",
    };

    function recordFor(instrument: Instrument): ReplaySessionRecord {
      return {
        id: "session-2",
        name: "검색으로 저장한 세션",
        schemaVersion: 1,
        configuration: {
          assets: [
            {
              instrumentId: instrument.id,
              providerId: instrument.providerId,
              providerSymbol: instrument.providerSymbol,
              simulationConfig: SIM_CONFIG,
            },
          ],
          interval: "1d",
          range: { startMs: 0, endMs: 86_400_000 },
          displayMode: "raw",
          replaySpeed: 1,
        },
        dataVersions: {},
        createdAtUtcMs: 0,
        updatedAtUtcMs: 0,
      };
    }

    it("기본 카탈로그에 없으면 provider 검색으로 보충한다", async () => {
      const tiingo: MarketDataProvider = {
        id: "tiingo",
        searchInstruments: () => Promise.resolve([AAPL]),
        getCandles: () => Promise.reject(new Error("not used")),
      };
      const catalog = await buildCatalogForRecord(
        recordFor(AAPL),
        CATALOG,
        new Map([["tiingo", tiingo]]),
      );
      expect(catalog[AAPL.id]).toEqual(AAPL);

      const restored = restoreSessionFromRecord(recordFor(AAPL), catalog);
      expect(restored.request.selections[0].instrument).toEqual(AAPL);
    });

    it("이미 기본 카탈로그에 있으면 provider를 호출하지 않는다", async () => {
      const searchInstruments = () => Promise.reject(new Error("호출되면 안 된다"));
      const binance: MarketDataProvider = {
        id: BTC.providerId,
        searchInstruments,
        getCandles: () => Promise.reject(new Error("not used")),
      };
      const catalog = await buildCatalogForRecord(
        makeRecord(),
        CATALOG,
        new Map([[BTC.providerId, binance]]),
      );
      expect(catalog[BTC.id]).toBe(BTC);
    });

    it("검색해도 못 찾으면 카탈로그에 추가하지 않고, 이후 restoreSessionFromRecord가 표준 오류로 실패한다", async () => {
      const tiingo: MarketDataProvider = {
        id: "tiingo",
        searchInstruments: () => Promise.resolve([]),
        getCandles: () => Promise.reject(new Error("not used")),
      };
      const catalog = await buildCatalogForRecord(
        recordFor(AAPL),
        CATALOG,
        new Map([["tiingo", tiingo]]),
      );
      expect(catalog[AAPL.id]).toBeUndefined();
      expect(() => restoreSessionFromRecord(recordFor(AAPL), catalog)).toThrow(
        DomainValidationError,
      );
    });
  });
});

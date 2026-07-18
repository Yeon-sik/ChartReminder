import { describe, expect, it } from "vitest";

import type { PrepareReplaySessionRequest } from "../../application/use-cases/prepareReplaySession";
import type { ReplaySessionRecord } from "../../domain/session/replaySession";
import { DomainValidationError } from "../../domain/shared/errors";
import { BINANCE_INSTRUMENTS } from "../../infrastructure/providers/binance/binanceCatalog";
import {
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
});

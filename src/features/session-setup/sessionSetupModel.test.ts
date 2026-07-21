import { describe, expect, it } from "vitest";

import { BINANCE_INSTRUMENTS } from "../../infrastructure/providers/binance/binanceCatalog";
import { KRX_PUBLIC_DATA_INSTRUMENTS } from "../../infrastructure/providers/krxPublicData/krxPublicDataCatalog";
import { DomainValidationError } from "../../domain/shared/errors";
import type { UsdKrwRate } from "../../domain/shared/fxConversion";
import {
  buildPrepareReplaySessionRequest,
  createDefaultFormState,
  defaultInvestmentSettings,
  type SessionSetupFormState,
} from "./sessionSetupModel";

const [BTC, ETH] = BINANCE_INSTRUMENTS;
const SAMSUNG = KRX_PUBLIC_DATA_INSTRUMENTS[0]; // KRW quoteCurrency
const RATE: UsdKrwRate = { krwPerUsd: "1400", asOfUtcMs: Date.UTC(2026, 0, 1) };

function baseState(overrides: Partial<SessionSetupFormState> = {}): SessionSetupFormState {
  return {
    assets: [BTC],
    startDate: "2024-01-01",
    endDate: "2024-06-30",
    displayMode: "normalized-100",
    investment: defaultInvestmentSettings(),
    ...overrides,
  };
}

describe("createDefaultFormState", () => {
  it("자산 1개, 180일 기간, normalized-100 표시 기준, 일시투자 기본값을 기본값으로 한다", () => {
    const nowUtcMs = Date.UTC(2024, 6, 15); // 2024-07-15
    const state = createDefaultFormState(nowUtcMs, BTC);

    expect(state.assets).toEqual([BTC]);
    expect(state.investment.mode).toBe("lump-sum");
    expect(state.endDate).toBe("2024-07-15");
    expect(state.startDate).toBe("2024-01-17"); // 180일 전
    expect(state.displayMode).toBe("normalized-100");
  });
});

describe("buildPrepareReplaySessionRequest — 정상 경로 (통합 투자 설정, D-020)", () => {
  it("일시투자 자산 1개를 요청으로 변환한다 (표시 통화 = 자산 통화군이면 환율 불필요)", () => {
    const request = buildPrepareReplaySessionRequest(baseState(), "USD", null);

    expect(request.selections).toHaveLength(1);
    expect(request.selections[0].instrument).toBe(BTC);
    expect(request.selections[0].simulationConfig).toMatchObject({
      mode: "lump-sum",
      initialCash: { amount: "1000", currency: "USDT" },
      feeRate: "0",
    });
    expect(request.range.startMs).toBeLessThan(request.range.endMs);
  });

  it("수수료 퍼센트 입력을 비율로 변환한다 (0.25% → 0.0025)", () => {
    const state = baseState({ investment: { ...defaultInvestmentSettings(), feePercent: "0.25" } });
    const request = buildPrepareReplaySessionRequest(state, "USD", null);
    expect(request.selections[0].simulationConfig.feeRate).toBe("0.0025");
  });

  it("정기매수 모드는 recurring 설정을 만든다", () => {
    const state = baseState({
      investment: {
        ...defaultInvestmentSettings(),
        mode: "dca",
        recurringAmount: "50",
        recurringFrequency: "monthly",
        recurringDayOfMonth: 15,
      },
    });
    const request = buildPrepareReplaySessionRequest(state, "USD", null);
    const config = request.selections[0].simulationConfig;

    expect(config.mode).toBe("dca");
    expect(config.recurring).toEqual({
      amount: { amount: "50", currency: "USDT" },
      frequency: "monthly",
      anchor: { kind: "day-of-month", dayOfMonth: 15 },
    });
  });

  it("자산 2개는 동일한 투자 설정을 각자 고유 통화로 환산해 적용한다", () => {
    const state = baseState({ assets: [BTC, SAMSUNG] });
    const request = buildPrepareReplaySessionRequest(state, "USD", RATE);

    expect(request.selections[0].simulationConfig.mode).toBe("lump-sum");
    expect(request.selections[0].simulationConfig.initialCash).toEqual({
      amount: "1000",
      currency: "USDT",
    });
    expect(request.selections[1].simulationConfig.mode).toBe("lump-sum");
    // 표시 통화 USD 1000 → KRW 1,400,000 (환율 1400)
    expect(request.selections[1].simulationConfig.initialCash).toEqual({
      amount: "1400000",
      currency: "KRW",
    });
  });

  it("표시 통화가 KRW면 KRW 자산은 그대로, USDT 자산만 환산한다", () => {
    const state = baseState({ assets: [SAMSUNG, BTC] });
    const request = buildPrepareReplaySessionRequest(state, "KRW", RATE);

    expect(request.selections[0].simulationConfig.initialCash).toEqual({
      amount: "1000",
      currency: "KRW",
    });
    // 표시 통화 KRW 1000 → USDT 1000/1400
    expect(request.selections[1].simulationConfig.initialCash.currency).toBe("USDT");
    expect(request.selections[1].simulationConfig.initialCash.amount).not.toBe("1000");
  });

  it("환산이 필요한데 환율이 없으면 DomainValidationError다", () => {
    const state = baseState({ assets: [SAMSUNG] });
    expect(() => buildPrepareReplaySessionRequest(state, "USD", null)).toThrow(
      DomainValidationError,
    );
  });
});

describe("buildPrepareReplaySessionRequest — 오류", () => {
  it("자산 0개를 거부한다", () => {
    expect(() => buildPrepareReplaySessionRequest(baseState({ assets: [] }), "USD", null)).toThrow(
      DomainValidationError,
    );
  });

  it("자산 3개를 거부한다", () => {
    const third = { ...BTC, id: "crypto-sol-usdt" };
    const state = baseState({ assets: [BTC, ETH, third] });
    expect(() => buildPrepareReplaySessionRequest(state, "USD", null)).toThrow(
      DomainValidationError,
    );
  });

  it("시작일이 종료일보다 늦으면 거부한다", () => {
    expect(() =>
      buildPrepareReplaySessionRequest(
        baseState({ startDate: "2024-07-01", endDate: "2024-01-01" }),
        "USD",
        null,
      ),
    ).toThrow(DomainValidationError);
  });

  it("음수 원금을 거부한다 (도메인 검증 위임)", () => {
    const state = baseState({
      investment: { ...defaultInvestmentSettings(), initialCash: "-100" },
    });
    expect(() => buildPrepareReplaySessionRequest(state, "USD", null)).toThrow(
      DomainValidationError,
    );
  });

  it("숫자가 아닌 수수료 입력을 거부한다", () => {
    const state = baseState({ investment: { ...defaultInvestmentSettings(), feePercent: "abc" } });
    expect(() => buildPrepareReplaySessionRequest(state, "USD", null)).toThrow(
      DomainValidationError,
    );
  });
});

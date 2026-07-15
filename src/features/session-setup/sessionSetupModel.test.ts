import { describe, expect, it } from "vitest";

import { BINANCE_INSTRUMENTS } from "../../infrastructure/providers/binance/binanceCatalog";
import { DomainValidationError } from "../../domain/shared/errors";
import {
  buildPrepareReplaySessionRequest,
  createDefaultFormState,
  defaultAssetFormState,
  type SessionSetupFormState,
} from "./sessionSetupModel";

const [BTC, ETH] = BINANCE_INSTRUMENTS;

function baseState(overrides: Partial<SessionSetupFormState> = {}): SessionSetupFormState {
  return {
    assets: [defaultAssetFormState(BTC)],
    startDate: "2024-01-01",
    endDate: "2024-06-30",
    displayMode: "normalized-100",
    ...overrides,
  };
}

describe("createDefaultFormState", () => {
  it("자산 1개, 180일 기간, normalized-100 표시 기준을 기본값으로 한다", () => {
    const nowUtcMs = Date.UTC(2024, 6, 15); // 2024-07-15
    const state = createDefaultFormState(nowUtcMs, BTC);

    expect(state.assets).toHaveLength(1);
    expect(state.assets[0].instrument).toBe(BTC);
    expect(state.assets[0].mode).toBe("lump-sum");
    expect(state.endDate).toBe("2024-07-15");
    expect(state.startDate).toBe("2024-01-17"); // 180일 전
    expect(state.displayMode).toBe("normalized-100");
  });
});

describe("buildPrepareReplaySessionRequest — 정상 경로", () => {
  it("일시투자 자산 1개를 요청으로 변환한다", () => {
    const request = buildPrepareReplaySessionRequest(baseState());

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
    const state = baseState({
      assets: [{ ...defaultAssetFormState(BTC), feePercent: "0.25" }],
    });
    const request = buildPrepareReplaySessionRequest(state);
    expect(request.selections[0].simulationConfig.feeRate).toBe("0.0025");
  });

  it("정기매수 모드는 recurring 설정을 만든다", () => {
    const state = baseState({
      assets: [
        {
          ...defaultAssetFormState(BTC),
          mode: "dca",
          recurringAmount: "50",
          recurringFrequency: "monthly",
          recurringDayOfMonth: 15,
        },
      ],
    });
    const request = buildPrepareReplaySessionRequest(state);
    const config = request.selections[0].simulationConfig;

    expect(config.mode).toBe("dca");
    expect(config.recurring).toEqual({
      amount: { amount: "50", currency: "USDT" },
      frequency: "monthly",
      anchor: { kind: "day-of-month", dayOfMonth: 15 },
    });
  });

  it("자산 2개는 서로 다른 투자 규칙을 유지한다", () => {
    const state = baseState({
      assets: [
        { ...defaultAssetFormState(BTC), mode: "lump-sum" },
        { ...defaultAssetFormState(ETH), mode: "dca" },
      ],
    });
    const request = buildPrepareReplaySessionRequest(state);

    expect(request.selections[0].simulationConfig.mode).toBe("lump-sum");
    expect(request.selections[1].simulationConfig.mode).toBe("dca");
  });
});

describe("buildPrepareReplaySessionRequest — 오류", () => {
  it("자산 0개를 거부한다", () => {
    expect(() => buildPrepareReplaySessionRequest(baseState({ assets: [] }))).toThrow(
      DomainValidationError,
    );
  });

  it("자산 3개를 거부한다", () => {
    const third = { ...BTC, id: "crypto-sol-usdt" };
    const state = baseState({
      assets: [
        defaultAssetFormState(BTC),
        defaultAssetFormState(ETH),
        defaultAssetFormState(third),
      ],
    });
    expect(() => buildPrepareReplaySessionRequest(state)).toThrow(DomainValidationError);
  });

  it("시작일이 종료일보다 늦으면 거부한다", () => {
    expect(() =>
      buildPrepareReplaySessionRequest(
        baseState({ startDate: "2024-07-01", endDate: "2024-01-01" }),
      ),
    ).toThrow(DomainValidationError);
  });

  it("음수 원금을 거부한다 (도메인 검증 위임)", () => {
    const state = baseState({ assets: [{ ...defaultAssetFormState(BTC), initialCash: "-100" }] });
    expect(() => buildPrepareReplaySessionRequest(state)).toThrow(DomainValidationError);
  });

  it("숫자가 아닌 수수료 입력을 거부한다", () => {
    const state = baseState({ assets: [{ ...defaultAssetFormState(BTC), feePercent: "abc" }] });
    expect(() => buildPrepareReplaySessionRequest(state)).toThrow(DomainValidationError);
  });
});

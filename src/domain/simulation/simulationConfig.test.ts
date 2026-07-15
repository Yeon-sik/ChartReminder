import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../shared/errors";
import { validateSimulationConfig, type SimulationConfig } from "./simulationConfig";

const USD = (amount: string) => ({ amount, currency: "USD" });

function lumpSum(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    mode: "lump-sum",
    initialCash: USD("1000"),
    executionPrice: "close",
    feeRate: "0",
    allowFractionalQuantity: true,
    dividendPolicy: "ignore",
    ...overrides,
  };
}

function dca(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    mode: "dca",
    initialCash: USD("0"),
    recurring: {
      amount: USD("100"),
      frequency: "weekly",
      anchor: { kind: "day-of-week", isoDayOfWeek: 3 },
    },
    executionPrice: "close",
    feeRate: "0",
    allowFractionalQuantity: true,
    dividendPolicy: "ignore",
    ...overrides,
  };
}

describe("validateSimulationConfig — 일시투자 정상·경계", () => {
  it("표준 일시투자 설정을 허용한다", () => {
    expect(() => validateSimulationConfig(lumpSum())).not.toThrow();
  });

  it("0원 일시투자를 허용한다 (docs/05 §9 '0원 원금')", () => {
    expect(() => validateSimulationConfig(lumpSum({ initialCash: USD("0") }))).not.toThrow();
  });

  it("일시투자 모드에 recurring이 있으면 거부한다", () => {
    expect(() =>
      validateSimulationConfig(
        lumpSum({
          recurring: {
            amount: USD("100"),
            frequency: "weekly",
            anchor: { kind: "day-of-week", isoDayOfWeek: 1 },
          },
        }),
      ),
    ).toThrow(DomainValidationError);
  });
});

describe("validateSimulationConfig — 음수 입력 거부 (docs/05 §9)", () => {
  it("음수 initialCash를 거부한다", () => {
    expect(() => validateSimulationConfig(lumpSum({ initialCash: USD("-1") }))).toThrow(
      DomainValidationError,
    );
  });

  it("음수 feeRate를 거부한다", () => {
    expect(() => validateSimulationConfig(lumpSum({ feeRate: "-0.01" }))).toThrow(
      DomainValidationError,
    );
  });

  it("유효한 10진 문자열이 아닌 initialCash를 거부한다", () => {
    expect(() => validateSimulationConfig(lumpSum({ initialCash: USD("abc") }))).toThrow(
      DomainValidationError,
    );
  });

  it("close 이외의 체결 가격 기준을 거부한다", () => {
    expect(() => validateSimulationConfig(lumpSum({ executionPrice: "open" as "close" }))).toThrow(
      DomainValidationError,
    );
  });
});

describe("validateSimulationConfig — 정기매수 정상·경계", () => {
  it("매주 정기매수 설정을 허용한다", () => {
    expect(() => validateSimulationConfig(dca())).not.toThrow();
  });

  it("매월 정기매수 설정을 허용한다", () => {
    expect(() =>
      validateSimulationConfig(
        dca({
          recurring: {
            amount: USD("100"),
            frequency: "monthly",
            anchor: { kind: "day-of-month", dayOfMonth: 15 },
          },
        }),
      ),
    ).not.toThrow();
  });

  it("정기매수 모드에 recurring이 없으면 거부한다", () => {
    expect(() => validateSimulationConfig(dca({ recurring: undefined }))).toThrow(
      DomainValidationError,
    );
  });

  it("정기매수 금액이 0이면 거부한다", () => {
    expect(() =>
      validateSimulationConfig(
        dca({
          recurring: {
            amount: USD("0"),
            frequency: "weekly",
            anchor: { kind: "day-of-week", isoDayOfWeek: 3 },
          },
        }),
      ),
    ).toThrow(DomainValidationError);
  });

  it("정기매수 통화가 초기 자금 통화와 다르면 거부한다", () => {
    expect(() =>
      validateSimulationConfig(
        dca({
          initialCash: { amount: "0", currency: "KRW" },
        }),
      ),
    ).toThrow(DomainValidationError);
  });

  it("매주 주기에 day-of-month anchor를 쓰면 거부한다", () => {
    expect(() =>
      validateSimulationConfig(
        dca({
          recurring: {
            amount: USD("100"),
            frequency: "weekly",
            anchor: { kind: "day-of-month", dayOfMonth: 1 },
          },
        }),
      ),
    ).toThrow(DomainValidationError);
  });

  it("매월 주기에 day-of-week anchor를 쓰면 거부한다", () => {
    expect(() =>
      validateSimulationConfig(
        dca({
          recurring: {
            amount: USD("100"),
            frequency: "monthly",
            anchor: { kind: "day-of-week", isoDayOfWeek: 1 },
          },
        }),
      ),
    ).toThrow(DomainValidationError);
  });

  it("범위를 벗어난 isoDayOfWeek를 거부한다", () => {
    expect(() =>
      validateSimulationConfig(
        dca({
          recurring: {
            amount: USD("100"),
            frequency: "weekly",
            anchor: { kind: "day-of-week", isoDayOfWeek: 8 },
          },
        }),
      ),
    ).toThrow(DomainValidationError);
  });

  it("범위를 벗어난 dayOfMonth를 거부한다", () => {
    expect(() =>
      validateSimulationConfig(
        dca({
          recurring: {
            amount: USD("100"),
            frequency: "monthly",
            anchor: { kind: "day-of-month", dayOfMonth: 32 },
          },
        }),
      ),
    ).toThrow(DomainValidationError);
  });
});

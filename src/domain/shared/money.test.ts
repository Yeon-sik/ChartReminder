import { describe, expect, it } from "vitest";

import { DomainValidationError } from "./errors";
import { addMoney, compareMoney, createMoney, subtractMoney, zeroMoney } from "./money";

describe("createMoney", () => {
  it("검증된 금액과 통화로 생성한다", () => {
    expect(createMoney("1000.50", "USD")).toEqual({ amount: "1000.50", currency: "USD" });
  });

  it("손익 표현을 위해 음수를 허용한다", () => {
    expect(createMoney("-100", "USD").amount).toBe("-100");
  });

  it("비정규 금액을 거부한다", () => {
    expect(() => createMoney("1e5", "USD")).toThrow(DomainValidationError);
    expect(() => createMoney("", "USD")).toThrow(DomainValidationError);
  });

  it("잘못된 통화 코드를 거부한다", () => {
    expect(() => createMoney("1", "usd")).toThrow(DomainValidationError);
    expect(() => createMoney("1", "")).toThrow(DomainValidationError);
  });
});

describe("금액 연산", () => {
  it("부동소수점 오차 없이 더하고 뺀다", () => {
    const a = createMoney("0.1", "USD");
    const b = createMoney("0.2", "USD");
    expect(addMoney(a, b).amount).toBe("0.3");
    expect(subtractMoney(b, a).amount).toBe("0.1");
  });

  it("서로 다른 통화 간 연산을 거부한다", () => {
    const usd = createMoney("1", "USD");
    const krw = createMoney("1", "KRW");
    expect(() => addMoney(usd, krw)).toThrow(DomainValidationError);
    expect(() => subtractMoney(usd, krw)).toThrow(DomainValidationError);
    expect(() => compareMoney(usd, krw)).toThrow(DomainValidationError);
  });

  it("값을 비교한다", () => {
    expect(compareMoney(createMoney("1", "USD"), createMoney("2", "USD"))).toBe(-1);
    expect(compareMoney(createMoney("2", "USD"), createMoney("2.00", "USD"))).toBe(0);
    expect(compareMoney(createMoney("3", "USD"), createMoney("2", "USD"))).toBe(1);
  });

  it("zeroMoney는 0 금액을 만든다", () => {
    expect(zeroMoney("KRW")).toEqual({ amount: "0", currency: "KRW" });
  });
});

import { describe, expect, it } from "vitest";

import { DomainValidationError } from "./errors";
import { convertAmount, convertMoney, type UsdKrwRate } from "./fxConversion";

const RATE: UsdKrwRate = { krwPerUsd: "1400", asOfUtcMs: Date.UTC(2026, 0, 1) };

describe("convertAmount", () => {
  it("같은 통화군(KRW→KRW)은 환율 없이 패스스루한다", () => {
    expect(convertAmount("1000", "KRW", "KRW", null)).toBe("1000");
  });

  it("USD-pegged 통화군(USD/USDT)끼리는 환율 없이 패스스루한다", () => {
    expect(convertAmount("1000", "USD", "USD", null)).toBe("1000");
    expect(convertAmount("1000", "USDT", "USD", null)).toBe("1000");
  });

  it("USD를 KRW로 환율만큼 곱해 환산한다", () => {
    expect(convertAmount("10", "USD", "KRW", RATE)).toBe("14000");
  });

  it("USDT도 USD와 동일하게(1:1 가정) KRW로 환산한다", () => {
    expect(convertAmount("10", "USDT", "KRW", RATE)).toBe("14000");
  });

  it("KRW를 USD로 환율만큼 나눠 환산한다", () => {
    expect(convertAmount("14000", "KRW", "USD", RATE)).toBe("10");
  });

  it("KRW를 USDT로 직접 환산한다 (통합 투자 금액 입력 방향, D-020)", () => {
    expect(convertAmount("14000", "KRW", "USDT", RATE)).toBe("10");
  });

  it("USDT를 KRW로 직접 환산한다", () => {
    expect(convertAmount("10", "USDT", "KRW", RATE)).toBe("14000");
  });

  it("환산이 필요한데 환율이 없으면 DomainValidationError다", () => {
    expect(() => convertAmount("10", "USD", "KRW", null)).toThrow(DomainValidationError);
    expect(() => convertAmount("14000", "KRW", "USD", null)).toThrow(DomainValidationError);
  });

  it("지원하지 않는 통화는 즉시 거부한다", () => {
    expect(() => convertAmount("10", "EUR", "KRW", RATE)).toThrow(DomainValidationError);
  });

  it("환율이 0 이하면 거부한다", () => {
    const badRate: UsdKrwRate = { krwPerUsd: "0", asOfUtcMs: Date.UTC(2026, 0, 1) };
    expect(() => convertAmount("10", "USD", "KRW", badRate)).toThrow(DomainValidationError);
  });
});

describe("convertMoney", () => {
  it("결과 currency는 항상 toCurrency다 (USDT→USD 표시 시에도 'USD'로 라벨링)", () => {
    const money = convertMoney({ amount: "5", currency: "USDT" }, "USD", null);
    expect(money).toEqual({ amount: "5", currency: "USD" });
  });

  it("KRW 표시로 변환한 결과의 currency는 'KRW'다", () => {
    const money = convertMoney({ amount: "10", currency: "USD" }, "KRW", RATE);
    expect(money).toEqual({ amount: "14000", currency: "KRW" });
  });
});

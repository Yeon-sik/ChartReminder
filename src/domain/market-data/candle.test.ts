import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../shared/errors";
import { assertValidCandle, candleDuplicateKey, validateCandle, type Candle } from "./candle";

const VALID_CANDLE: Candle = {
  instrumentId: "golden-alpha",
  interval: "1d",
  openTimeUtcMs: Date.UTC(2024, 0, 1),
  closeTimeUtcMs: Date.UTC(2024, 0, 2),
  tradingDate: "2024-01-01",
  open: "100",
  high: "115.5",
  low: "95",
  close: "110",
  volume: "1234.5",
  quoteCurrency: "USD",
  source: {
    providerId: "test-provider",
    providerSymbol: "ALPHAUSD",
    fetchedAtUtcMs: Date.UTC(2024, 0, 3),
    priceBasis: "raw",
  },
};

function issueCodes(candle: Candle): string[] {
  return validateCandle(candle).map((issue) => issue.code);
}

describe("validateCandle", () => {
  it("유효한 캔들은 위반이 없다", () => {
    expect(validateCandle(VALID_CANDLE)).toEqual([]);
    expect(() => assertValidCandle(VALID_CANDLE)).not.toThrow();
  });

  it("openTimeUtcMs >= closeTimeUtcMs를 거부한다", () => {
    expect(issueCodes({ ...VALID_CANDLE, closeTimeUtcMs: VALID_CANDLE.openTimeUtcMs })).toContain(
      "time-not-ascending",
    );
    expect(
      issueCodes({ ...VALID_CANDLE, closeTimeUtcMs: VALID_CANDLE.openTimeUtcMs - 1 }),
    ).toContain("time-not-ascending");
  });

  it("정수가 아닌 타임스탬프를 거부한다", () => {
    expect(issueCodes({ ...VALID_CANDLE, openTimeUtcMs: 1.5 })).toContain("invalid-open-time");
    expect(issueCodes({ ...VALID_CANDLE, closeTimeUtcMs: Number.NaN })).toContain(
      "invalid-close-time",
    );
  });

  it("잘못된 거래일을 거부한다", () => {
    expect(issueCodes({ ...VALID_CANDLE, tradingDate: "2024-02-30" })).toContain(
      "invalid-trading-date",
    );
  });

  it("파싱 불가능한 가격을 거부한다", () => {
    expect(issueCodes({ ...VALID_CANDLE, open: "abc" })).toContain("unparseable-price");
    expect(issueCodes({ ...VALID_CANDLE, close: "1e5" })).toContain("unparseable-price");
    expect(issueCodes({ ...VALID_CANDLE, high: "Infinity" })).toContain("unparseable-price");
  });

  it("high < max(open, close)를 거부한다", () => {
    expect(issueCodes({ ...VALID_CANDLE, high: "109.99" })).toContain("high-below-body");
  });

  it("low > min(open, close)를 거부한다", () => {
    expect(issueCodes({ ...VALID_CANDLE, low: "100.01" })).toContain("low-above-body");
  });

  it("high = max(open, close), low = min(open, close) 경계를 허용한다", () => {
    expect(validateCandle({ ...VALID_CANDLE, high: "110", low: "100" })).toEqual([]);
  });

  it("음수 가격 자체는 도메인 수준에서 금지하지 않는다", () => {
    const negative: Candle = {
      ...VALID_CANDLE,
      open: "-10",
      high: "-5",
      low: "-20",
      close: "-5",
    };
    expect(validateCandle(negative)).toEqual([]);
  });

  it("음수 거래량을 거부한다", () => {
    expect(issueCodes({ ...VALID_CANDLE, volume: "-1" })).toContain("negative-volume");
  });

  it("선택 필드가 없어도 유효하다", () => {
    expect(validateCandle({ ...VALID_CANDLE, volume: undefined })).toEqual([]);
  });

  it("잘못된 통화 코드를 거부한다", () => {
    expect(issueCodes({ ...VALID_CANDLE, quoteCurrency: "usd" })).toContain("invalid-currency");
  });

  it("여러 위반을 모두 보고한다", () => {
    const broken: Candle = {
      ...VALID_CANDLE,
      closeTimeUtcMs: VALID_CANDLE.openTimeUtcMs,
      tradingDate: "bad",
      open: "abc",
    };
    const codes = issueCodes(broken);
    expect(codes).toContain("time-not-ascending");
    expect(codes).toContain("invalid-trading-date");
    expect(codes).toContain("unparseable-price");
  });

  it("assertValidCandle은 위반 목록을 담아 던진다", () => {
    expect(() => assertValidCandle({ ...VALID_CANDLE, open: "abc" })).toThrow(
      DomainValidationError,
    );
  });
});

describe("candleDuplicateKey", () => {
  it("(instrumentId, interval, openTimeUtcMs, providerId)로 중복을 판정한다", () => {
    const other: Candle = { ...VALID_CANDLE, close: "111", high: "120" };
    expect(candleDuplicateKey(other)).toBe(candleDuplicateKey(VALID_CANDLE));

    const differentProvider: Candle = {
      ...VALID_CANDLE,
      source: { ...VALID_CANDLE.source, providerId: "other-provider" },
    };
    expect(candleDuplicateKey(differentProvider)).not.toBe(candleDuplicateKey(VALID_CANDLE));
  });
});

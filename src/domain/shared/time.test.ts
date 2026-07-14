import { describe, expect, it } from "vitest";

import { DomainValidationError } from "./errors";
import {
  compareTradingDates,
  isTradingDate,
  isUtcTimestampMs,
  utcTradingDateFromUtcMs,
} from "./time";

describe("isTradingDate", () => {
  it.each(["2024-01-01", "2024-02-29", "2000-02-29", "1999-12-31", "2024-04-30"])(
    "유효한 달력 날짜를 허용한다: %s",
    (value) => {
      expect(isTradingDate(value)).toBe(true);
    },
  );

  it.each([
    "2023-02-29", // 평년 윤일
    "1900-02-29", // 100년 규칙 평년
    "2024-04-31",
    "2024-13-01",
    "2024-00-10",
    "2024-01-00",
    "2024-01-32",
    "2024-1-1",
    "24-01-01",
    "2024/01/01",
    "2024-01-01T00:00:00Z",
    "",
  ])("잘못된 날짜를 거부한다: %s", (value) => {
    expect(isTradingDate(value)).toBe(false);
  });
});

describe("isUtcTimestampMs", () => {
  it("정수 밀리초만 허용한다", () => {
    expect(isUtcTimestampMs(0)).toBe(true);
    expect(isUtcTimestampMs(1704067200000)).toBe(true);
    expect(isUtcTimestampMs(-86400000)).toBe(true);
    expect(isUtcTimestampMs(1.5)).toBe(false);
    expect(isUtcTimestampMs(Number.NaN)).toBe(false);
    expect(isUtcTimestampMs(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("utcTradingDateFromUtcMs", () => {
  it("UTC 자정 경계를 정확히 처리한다", () => {
    const midnight = Date.UTC(2024, 0, 2); // 2024-01-02T00:00:00Z
    expect(utcTradingDateFromUtcMs(midnight)).toBe("2024-01-02");
    expect(utcTradingDateFromUtcMs(midnight - 1)).toBe("2024-01-01");
  });

  it("하루 안의 임의 시각은 같은 거래일이다", () => {
    expect(utcTradingDateFromUtcMs(Date.UTC(2024, 5, 15, 23, 59, 59, 999))).toBe("2024-06-15");
  });

  it("정수가 아닌 입력을 거부한다", () => {
    expect(() => utcTradingDateFromUtcMs(1.5)).toThrow(DomainValidationError);
    expect(() => utcTradingDateFromUtcMs(Number.NaN)).toThrow(DomainValidationError);
  });
});

describe("compareTradingDates", () => {
  it("사전순 비교가 시간순과 일치한다", () => {
    expect(compareTradingDates("2024-01-01", "2024-01-02")).toBe(-1);
    expect(compareTradingDates("2024-01-02", "2024-01-02")).toBe(0);
    expect(compareTradingDates("2024-02-01", "2024-01-31")).toBe(1);
    expect(compareTradingDates("2023-12-31", "2024-01-01")).toBe(-1);
  });
});

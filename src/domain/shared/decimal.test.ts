import { describe, expect, it } from "vitest";

import {
  DomainDecimal,
  isDecimalString,
  parseDecimal,
  toChartNumber,
  toDecimalString,
} from "./decimal";
import { DomainValidationError } from "./errors";

describe("isDecimalString", () => {
  it.each(["0", "100", "-1", "0.5", "-0.5", "123.4500", "90000000000000000000.000001"])(
    "정규 10진 문자열을 허용한다: %s",
    (value) => {
      expect(isDecimalString(value)).toBe(true);
    },
  );

  it.each([
    "",
    " 1",
    "1 ",
    "+1",
    ".5",
    "5.",
    "01",
    "1e5",
    "1E-8",
    "NaN",
    "Infinity",
    "0x10",
    "1,000",
  ])("비정규 문자열을 거부한다: %s", (value) => {
    expect(isDecimalString(value)).toBe(false);
  });
});

describe("parseDecimal / toDecimalString", () => {
  it("부동소수점 오차 없이 더한다 (0.1 + 0.2 = 0.3)", () => {
    const sum = parseDecimal("0.1").plus(parseDecimal("0.2"));
    expect(toDecimalString(sum)).toBe("0.3");
  });

  it("잘못된 입력에 DomainValidationError를 던진다", () => {
    expect(() => parseDecimal("abc")).toThrow(DomainValidationError);
    expect(() => parseDecimal("1e5")).toThrow(DomainValidationError);
  });

  it("큰 값도 지수 표기 없이 직렬화한다", () => {
    const big = parseDecimal("1000000000000000000000000").times(parseDecimal("10"));
    expect(toDecimalString(big)).toBe("10000000000000000000000000");
  });

  it("-0을 0으로 정규화한다", () => {
    expect(toDecimalString(parseDecimal("0").times(parseDecimal("-1")))).toBe("0");
  });

  it("유한하지 않은 값의 직렬화를 거부한다", () => {
    const infinite = parseDecimal("1").dividedBy(new DomainDecimal(0));
    expect(() => toDecimalString(infinite)).toThrow(DomainValidationError);
  });

  it("직렬화 후 재파싱해도 같은 값이다", () => {
    const original = parseDecimal("123.456").dividedBy(parseDecimal("2"));
    expect(parseDecimal(toDecimalString(original)).equals(original)).toBe(true);
  });
});

describe("toChartNumber", () => {
  it("차트 경계에서 number로 변환한다", () => {
    expect(toChartNumber("123.45")).toBe(123.45);
    expect(toChartNumber("-0.5")).toBe(-0.5);
  });

  it("비정규 문자열을 거부한다", () => {
    expect(() => toChartNumber("abc")).toThrow(DomainValidationError);
  });

  it("double 범위를 벗어나는 값을 거부한다", () => {
    const overflow = `1${"0".repeat(400)}`;
    expect(() => toChartNumber(overflow)).toThrow(DomainValidationError);
  });
});

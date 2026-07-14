import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../shared/errors";
import { unionTradingDates } from "./timeline";

describe("unionTradingDates", () => {
  it("두 자산 거래일의 합집합을 오름차순으로 만든다", () => {
    const crypto = ["2024-01-05", "2024-01-06", "2024-01-07"]; // 주말 포함
    const stock = ["2024-01-05", "2024-01-08"]; // 주말 휴장
    expect(unionTradingDates([crypto, stock])).toEqual([
      "2024-01-05",
      "2024-01-06",
      "2024-01-07",
      "2024-01-08",
    ]);
  });

  it("중복 날짜를 제거한다", () => {
    expect(unionTradingDates([["2024-01-01"], ["2024-01-01"]])).toEqual(["2024-01-01"]);
  });

  it("입력 정렬 상태와 무관하게 같은 결과를 만든다", () => {
    const shuffled = unionTradingDates([["2024-01-03", "2024-01-01"], ["2024-01-02"]]);
    const sorted = unionTradingDates([["2024-01-01", "2024-01-03"], ["2024-01-02"]]);
    expect(shuffled).toEqual(sorted);
    expect(shuffled).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
  });

  it("입력 배열 순서와 무관하게 같은 결과를 만든다 (결정론)", () => {
    const a = ["2024-01-01", "2024-01-03"];
    const b = ["2024-01-02"];
    expect(unionTradingDates([a, b])).toEqual(unionTradingDates([b, a]));
  });

  it("빈 입력은 빈 타임라인이다", () => {
    expect(unionTradingDates([])).toEqual([]);
    expect(unionTradingDates([[], []])).toEqual([]);
  });

  it("단일 자산은 정렬·중복 제거만 수행한다", () => {
    expect(unionTradingDates([["2024-01-02", "2024-01-01", "2024-01-02"]])).toEqual([
      "2024-01-01",
      "2024-01-02",
    ]);
  });

  it("연도 경계를 시간순으로 정렬한다", () => {
    expect(unionTradingDates([["2024-01-01", "2023-12-29"]])).toEqual(["2023-12-29", "2024-01-01"]);
  });

  it("유효하지 않은 거래일을 거부한다", () => {
    expect(() => unionTradingDates([["2024-02-30"]])).toThrow(DomainValidationError);
    expect(() => unionTradingDates([["not-a-date"]])).toThrow(DomainValidationError);
  });
});

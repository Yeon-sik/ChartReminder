import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../shared/errors";
import { cumulativeReturnRate, normalizeToBase100 } from "./priceNormalization";

describe("normalizeToBase100", () => {
  it("빈 배열은 빈 배열을 반환한다", () => {
    expect(normalizeToBase100([])).toEqual([]);
  });

  it("첫 값을 100으로 정규화한다 (Golden Fixture 경로 100→110→90→120→120)", () => {
    expect(normalizeToBase100(["100", "110", "90", "120", "120"])).toEqual([
      "100",
      "110",
      "90",
      "120",
      "120",
    ]);
  });

  it("첫 값이 100이 아니어도 비례 계산한다", () => {
    expect(normalizeToBase100(["50", "75"])).toEqual(["100", "150"]);
  });

  it("첫 값이 0이면 거부한다", () => {
    expect(() => normalizeToBase100(["0", "10"])).toThrow(DomainValidationError);
  });

  it("첫 값이 음수면 거부한다", () => {
    expect(() => normalizeToBase100(["-1", "10"])).toThrow(DomainValidationError);
  });
});

describe("cumulativeReturnRate", () => {
  it("빈 배열은 빈 배열을 반환한다", () => {
    expect(cumulativeReturnRate([])).toEqual([]);
  });

  it("첫 값 대비 누적 수익률을 소수로 계산한다", () => {
    expect(cumulativeReturnRate(["100", "110", "90", "120"])).toEqual(["0", "0.1", "-0.1", "0.2"]);
  });

  it("첫 값이 0이면 거부한다", () => {
    expect(() => cumulativeReturnRate(["0", "10"])).toThrow(DomainValidationError);
  });
});

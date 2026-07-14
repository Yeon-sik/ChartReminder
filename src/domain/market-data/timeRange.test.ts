import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../shared/errors";
import {
  createUtcTimeRange,
  intersectUtcTimeRanges,
  normalizeUtcTimeRanges,
  subtractUtcTimeRanges,
} from "./timeRange";

const range = (startMs: number, endMs: number) => createUtcTimeRange(startMs, endMs);

describe("createUtcTimeRange", () => {
  it("유효한 반개구간을 만든다", () => {
    expect(range(0, 10)).toEqual({ startMs: 0, endMs: 10 });
  });

  it("빈 범위와 뒤집힌 범위를 거부한다", () => {
    expect(() => range(10, 10)).toThrow(DomainValidationError);
    expect(() => range(20, 10)).toThrow(DomainValidationError);
  });

  it("정수가 아닌 경계를 거부한다", () => {
    expect(() => range(0.5, 10)).toThrow(DomainValidationError);
    expect(() => range(0, Number.NaN)).toThrow(DomainValidationError);
  });
});

describe("normalizeUtcTimeRanges", () => {
  it("겹치는 범위를 병합한다", () => {
    expect(normalizeUtcTimeRanges([range(0, 10), range(5, 20)])).toEqual([range(0, 20)]);
  });

  it("맞닿은 범위를 병합한다 (반개구간)", () => {
    expect(normalizeUtcTimeRanges([range(0, 10), range(10, 20)])).toEqual([range(0, 20)]);
  });

  it("떨어진 범위는 유지하고 정렬한다", () => {
    expect(normalizeUtcTimeRanges([range(30, 40), range(0, 10)])).toEqual([
      range(0, 10),
      range(30, 40),
    ]);
  });

  it("포함된 범위를 흡수한다", () => {
    expect(normalizeUtcTimeRanges([range(0, 100), range(10, 20)])).toEqual([range(0, 100)]);
  });

  it("빈 입력은 빈 결과다", () => {
    expect(normalizeUtcTimeRanges([])).toEqual([]);
  });
});

describe("subtractUtcTimeRanges", () => {
  it("커버리지가 없으면 요청 전체가 누락이다", () => {
    expect(subtractUtcTimeRanges(range(0, 100), [])).toEqual([range(0, 100)]);
  });

  it("완전히 커버되면 누락이 없다", () => {
    expect(subtractUtcTimeRanges(range(10, 90), [range(0, 100)])).toEqual([]);
    expect(subtractUtcTimeRanges(range(0, 100), [range(0, 100)])).toEqual([]);
  });

  it("가운데가 커버되면 양 끝이 누락이다", () => {
    expect(subtractUtcTimeRanges(range(0, 100), [range(40, 60)])).toEqual([
      range(0, 40),
      range(60, 100),
    ]);
  });

  it("앞부분만 커버되면 뒷부분이 누락이다", () => {
    expect(subtractUtcTimeRanges(range(0, 100), [range(0, 30)])).toEqual([range(30, 100)]);
  });

  it("여러 조각 커버리지 사이의 구멍을 모두 찾는다", () => {
    expect(subtractUtcTimeRanges(range(0, 100), [range(10, 20), range(50, 60)])).toEqual([
      range(0, 10),
      range(20, 50),
      range(60, 100),
    ]);
  });

  it("요청 범위 밖 커버리지는 무시한다", () => {
    expect(subtractUtcTimeRanges(range(50, 100), [range(0, 10), range(200, 300)])).toEqual([
      range(50, 100),
    ]);
  });

  it("경계가 정확히 맞닿는 커버리지를 처리한다 (반개구간)", () => {
    expect(subtractUtcTimeRanges(range(0, 100), [range(0, 50), range(50, 100)])).toEqual([]);
  });
});

describe("intersectUtcTimeRanges", () => {
  it("겹치는 부분을 반환한다", () => {
    expect(intersectUtcTimeRanges(range(0, 50), range(30, 100))).toEqual(range(30, 50));
  });

  it("겹치지 않으면 null이다 (맞닿음 포함)", () => {
    expect(intersectUtcTimeRanges(range(0, 50), range(50, 100))).toBeNull();
    expect(intersectUtcTimeRanges(range(0, 10), range(90, 100))).toBeNull();
  });
});

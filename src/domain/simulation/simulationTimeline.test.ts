import { describe, expect, it } from "vitest";

import type { Candle } from "../market-data/candle";
import { buildReplayDataset } from "../replay/replayDataset";
import { DomainValidationError } from "../shared/errors";
import { buildSimulationDays } from "./simulationTimeline";

const DAY_MS = 86_400_000;
const FIRST_OPEN_UTC_MS = Date.UTC(2024, 0, 1);

function candle(
  tradingDate: string,
  close: string,
  index: number,
  overrides: Partial<Candle> = {},
): Candle {
  return {
    instrumentId: "alpha",
    interval: "1d",
    openTimeUtcMs: FIRST_OPEN_UTC_MS + index * DAY_MS,
    closeTimeUtcMs: FIRST_OPEN_UTC_MS + (index + 1) * DAY_MS,
    tradingDate,
    open: close,
    high: close,
    low: close,
    close,
    quoteCurrency: "USD",
    source: {
      providerId: "test",
      providerSymbol: "ALPHAUSD",
      fetchedAtUtcMs: FIRST_OPEN_UTC_MS,
      priceBasis: "raw",
    },
    ...overrides,
  };
}

describe("buildSimulationDays — 정상 경로", () => {
  it("모든 날짜에 캔들이 있으면 fresh 가격만 만든다", () => {
    const dataset = buildReplayDataset(
      [
        {
          instrumentId: "alpha",
          candles: [
            candle("2024-01-01", "100", 0),
            candle("2024-01-02", "110", 1),
            candle("2024-01-03", "90", 2),
          ],
        },
      ],
      { interval: "1d" },
    );

    const days = buildSimulationDays(dataset, "alpha");

    expect(days).toEqual([
      {
        date: "2024-01-01",
        executionPrice: "100",
        valuationPrice: { value: "100", status: "fresh", observedAt: "2024-01-01" },
      },
      {
        date: "2024-01-02",
        executionPrice: "110",
        valuationPrice: { value: "110", status: "fresh", observedAt: "2024-01-02" },
      },
      {
        date: "2024-01-03",
        executionPrice: "90",
        valuationPrice: { value: "90", status: "fresh", observedAt: "2024-01-03" },
      },
    ]);
  });
});

describe("buildSimulationDays — 데이터 중간 누락 (휴장·미수신)", () => {
  it("합집합 타임라인에서 다른 자산에만 있는 날짜는 carried-forward로 이월한다", () => {
    const dataset = buildReplayDataset(
      [
        {
          instrumentId: "alpha",
          candles: [candle("2024-01-01", "100", 0), candle("2024-01-03", "120", 2)],
        },
        {
          instrumentId: "beta",
          candles: [
            candle("2024-01-01", "1", 0, { instrumentId: "beta" }),
            candle("2024-01-02", "1", 1, { instrumentId: "beta" }),
            candle("2024-01-03", "1", 2, { instrumentId: "beta" }),
          ],
        },
      ],
      { interval: "1d" },
    );

    const days = buildSimulationDays(dataset, "alpha");

    expect(days).toEqual([
      {
        date: "2024-01-01",
        executionPrice: "100",
        valuationPrice: { value: "100", status: "fresh", observedAt: "2024-01-01" },
      },
      {
        date: "2024-01-02",
        executionPrice: null,
        valuationPrice: { value: "100", status: "carried-forward", observedAt: "2024-01-01" },
      },
      {
        date: "2024-01-03",
        executionPrice: "120",
        valuationPrice: { value: "120", status: "fresh", observedAt: "2024-01-03" },
      },
    ]);
  });
});

describe("buildSimulationDays — 상장 이전 기간", () => {
  it("아직 관측된 가격이 없는 초기 구간은 valuationPrice가 null이다", () => {
    const dataset = buildReplayDataset(
      [
        {
          instrumentId: "alpha",
          candles: [candle("2024-01-03", "100", 2)],
        },
        {
          instrumentId: "beta",
          candles: [
            candle("2024-01-01", "1", 0, { instrumentId: "beta" }),
            candle("2024-01-02", "1", 1, { instrumentId: "beta" }),
            candle("2024-01-03", "1", 2, { instrumentId: "beta" }),
          ],
        },
      ],
      { interval: "1d" },
    );

    const days = buildSimulationDays(dataset, "alpha");

    expect(days[0]).toEqual({ date: "2024-01-01", executionPrice: null, valuationPrice: null });
    expect(days[1]).toEqual({ date: "2024-01-02", executionPrice: null, valuationPrice: null });
    expect(days[2]).toEqual({
      date: "2024-01-03",
      executionPrice: "100",
      valuationPrice: { value: "100", status: "fresh", observedAt: "2024-01-03" },
    });
  });
});

describe("buildSimulationDays — 수정주가 옵션", () => {
  it("useAdjustedClose가 true고 adjustedClose가 있으면 그 값을 쓴다", () => {
    const dataset = buildReplayDataset(
      [
        {
          instrumentId: "alpha",
          candles: [candle("2024-01-01", "100", 0, { adjustedClose: "95" })],
        },
      ],
      { interval: "1d" },
    );

    const days = buildSimulationDays(dataset, "alpha", { useAdjustedClose: true });

    expect(days[0].executionPrice).toBe("95");
    expect(days[0].valuationPrice?.value).toBe("95");
  });

  it("useAdjustedClose가 true지만 adjustedClose가 없으면 close를 쓴다", () => {
    const dataset = buildReplayDataset(
      [{ instrumentId: "alpha", candles: [candle("2024-01-01", "100", 0)] }],
      { interval: "1d" },
    );

    const days = buildSimulationDays(dataset, "alpha", { useAdjustedClose: true });

    expect(days[0].executionPrice).toBe("100");
  });
});

describe("buildSimulationDays — 오류", () => {
  it("데이터셋에 없는 자산을 요청하면 거부한다", () => {
    const dataset = buildReplayDataset(
      [{ instrumentId: "alpha", candles: [candle("2024-01-01", "100", 0)] }],
      { interval: "1d" },
    );

    expect(() => buildSimulationDays(dataset, "not-in-dataset")).toThrow(DomainValidationError);
  });
});

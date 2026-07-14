import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../shared/errors";
import type { Candle } from "../market-data/candle";
import { buildReplayDataset, indexReplayDataset, type CandleSeries } from "./replayDataset";

const DAY_MS = 86_400_000;
const JAN_1 = Date.UTC(2024, 0, 1);

function makeCandle(instrumentId: string, dayOffset: number): Candle {
  const openTimeUtcMs = JAN_1 + dayOffset * DAY_MS;
  return {
    instrumentId,
    interval: "1d",
    openTimeUtcMs,
    closeTimeUtcMs: openTimeUtcMs + DAY_MS - 1,
    tradingDate: new Date(openTimeUtcMs).toISOString().slice(0, 10),
    open: "100",
    high: "110",
    low: "90",
    close: "105",
    quoteCurrency: "USDT",
    source: {
      providerId: "binance",
      providerSymbol: "TESTUSDT",
      fetchedAtUtcMs: JAN_1,
      priceBasis: "raw",
    },
  };
}

function series(instrumentId: string, dayOffsets: number[]): CandleSeries {
  return { instrumentId, candles: dayOffsets.map((offset) => makeCandle(instrumentId, offset)) };
}

describe("buildReplayDataset", () => {
  it("자산 거래일의 합집합 타임라인을 만든다", () => {
    const dataset = buildReplayDataset([series("a", [0, 1, 2]), series("b", [1, 3])], {
      interval: "1d",
    });
    expect(dataset.timeline).toEqual(["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"]);
  });

  it("없는 날짜에 캔들을 만들어 채우지 않는다 (gap 유지)", () => {
    const dataset = buildReplayDataset([series("a", [0, 1, 2]), series("b", [1, 3])], {
      interval: "1d",
    });
    const index = indexReplayDataset(dataset);
    expect(index.candleAt("b", "2024-01-02")).toBeDefined();
    expect(index.candleAt("b", "2024-01-01")).toBeUndefined();
    expect(index.candleAt("b", "2024-01-03")).toBeUndefined();
    expect(index.candleAt("a", "2024-01-04")).toBeUndefined();
    expect(index.candleAt("unknown", "2024-01-01")).toBeUndefined();
  });

  it("빈 시계열 목록은 빈 타임라인이 된다", () => {
    expect(buildReplayDataset([], { interval: "1d" }).timeline).toEqual([]);
  });

  it("중복 자산 시계열을 거부한다", () => {
    expect(() =>
      buildReplayDataset([series("a", [0]), series("a", [1])], { interval: "1d" }),
    ).toThrow(DomainValidationError);
  });

  it("거래일 오름차순·중복 없음을 위반한 시계열을 거부한다", () => {
    const unsorted: CandleSeries = {
      instrumentId: "a",
      candles: [makeCandle("a", 1), makeCandle("a", 0)],
    };
    const duplicated: CandleSeries = {
      instrumentId: "a",
      candles: [makeCandle("a", 0), makeCandle("a", 0)],
    };
    expect(() => buildReplayDataset([unsorted], { interval: "1d" })).toThrow(DomainValidationError);
    expect(() => buildReplayDataset([duplicated], { interval: "1d" })).toThrow(
      DomainValidationError,
    );
  });

  it("다른 자산의 캔들이 섞인 시계열을 거부한다", () => {
    const mixed: CandleSeries = { instrumentId: "a", candles: [makeCandle("b", 0)] };
    expect(() => buildReplayDataset([mixed], { interval: "1d" })).toThrow(DomainValidationError);
  });
});

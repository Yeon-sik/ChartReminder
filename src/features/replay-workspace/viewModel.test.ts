import { describe, expect, it } from "vitest";

import { GOLDEN_CANDLES, GOLDEN_INSTRUMENT } from "../../domain/fixtures/goldenFixture";
import type { Instrument } from "../../domain/instrument/instrument";
import type { Candle } from "../../domain/market-data/candle";
import { buildReplayDataset } from "../../domain/replay/replayDataset";
import type { SimulationConfig } from "../../domain/simulation/simulationConfig";
import { runSimulation, type SimulationResult } from "../../domain/simulation/simulationEngine";
import { buildSimulationDays } from "../../domain/simulation/simulationTimeline";
import { buildPortfolioSeries, buildPriceSeries, buildResultSummary } from "./viewModel";

const LATE_INSTRUMENT: Instrument = {
  ...GOLDEN_INSTRUMENT,
  id: "golden-late",
  symbol: "LATE",
  displayName: "Late Listing",
};

/** golden-alpha와 같은 타임라인에서 1/3부터만 상장한 자산(후행 상장 시나리오). */
const LATE_CANDLES: Candle[] = GOLDEN_CANDLES.filter((c) => c.tradingDate >= "2024-01-03").map(
  (c) => ({ ...c, instrumentId: LATE_INSTRUMENT.id }),
);

const dataset = buildReplayDataset(
  [
    { instrumentId: GOLDEN_INSTRUMENT.id, candles: GOLDEN_CANDLES },
    { instrumentId: LATE_INSTRUMENT.id, candles: LATE_CANDLES },
  ],
  { interval: "1d" },
);

const lumpSumConfig: SimulationConfig = {
  mode: "lump-sum",
  initialCash: { amount: "1000", currency: "USD" },
  executionPrice: "close",
  feeRate: "0",
  allowFractionalQuantity: true,
  dividendPolicy: "ignore",
};

function runFor(instrumentId: string): SimulationResult {
  return runSimulation(buildSimulationDays(dataset, instrumentId), lumpSumConfig);
}

const resultsByInstrumentId = {
  [GOLDEN_INSTRUMENT.id]: runFor(GOLDEN_INSTRUMENT.id),
  [LATE_INSTRUMENT.id]: runFor(LATE_INSTRUMENT.id),
};
const instrumentsById = {
  [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT,
  [LATE_INSTRUMENT.id]: LATE_INSTRUMENT,
};

describe("buildPriceSeries — 미래 데이터 비노출 (R6)", () => {
  it("cursorIndex 이후 날짜는 절대 포함하지 않는다 (raw)", () => {
    const [series] = buildPriceSeries(
      dataset,
      { [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT },
      "raw",
      2,
    );

    expect(series.points.map((p) => p.time)).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
    expect(series.points.map((p) => p.value)).toEqual([100, 110, 90]);
  });

  it("cursorIndex를 늘리면 이전에 없던 미래 포인트가 드러난다 (재생 진행 시뮬레이션)", () => {
    const at4 = buildPriceSeries(
      dataset,
      { [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT },
      "raw",
      4,
    )[0];
    expect(at4.points.map((p) => p.time)).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
      "2024-01-04",
      "2024-01-05",
    ]);
  });

  it("normalized-100 모드: 첫 값이 100이면 raw와 같다", () => {
    const [series] = buildPriceSeries(
      dataset,
      { [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT },
      "normalized-100",
      2,
    );
    expect(series.points.map((p) => p.value)).toEqual([100, 110, 90]);
  });

  it("cumulative-return 모드: 첫 값 대비 %로 변환한다", () => {
    const [series] = buildPriceSeries(
      dataset,
      { [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT },
      "cumulative-return",
      2,
    );
    expect(series.points.map((p) => p.value)).toEqual([0, 10, -10]);
  });

  it("상장 이전 구간은 포인트 자체가 없다 (0으로 채우지 않음)", () => {
    const [series] = buildPriceSeries(dataset, { [LATE_INSTRUMENT.id]: LATE_INSTRUMENT }, "raw", 1);
    expect(series.points).toEqual([]);
  });

  it("상장일 이후에는 상장일부터 포인트가 시작된다", () => {
    const [series] = buildPriceSeries(dataset, { [LATE_INSTRUMENT.id]: LATE_INSTRUMENT }, "raw", 3);
    expect(series.points.map((p) => p.time)).toEqual(["2024-01-03", "2024-01-04"]);
  });

  it("자산 라벨은 표시명과 심볼을 포함한다", () => {
    const [series] = buildPriceSeries(
      dataset,
      { [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT },
      "raw",
      0,
    );
    expect(series.label).toBe("Golden Fixture Alpha (ALPHA)");
  });
});

describe("buildPortfolioSeries — 미래 데이터 비노출 (R6)", () => {
  it("cursorIndex 이후 스냅샷은 포함하지 않는다", () => {
    const [series] = buildPortfolioSeries(resultsByInstrumentId, instrumentsById, 2).filter(
      (s) => s.instrumentId === GOLDEN_INSTRUMENT.id,
    );

    expect(series.totalValue.map((p) => p.value)).toEqual([1000, 1100, 900]);
    expect(series.totalValue).toHaveLength(3);
  });

  it("완료 시점(cursorIndex=4)에는 전체 스냅샷이 드러난다", () => {
    const [series] = buildPortfolioSeries(resultsByInstrumentId, instrumentsById, 4).filter(
      (s) => s.instrumentId === GOLDEN_INSTRUMENT.id,
    );
    expect(series.totalValue.map((p) => p.value)).toEqual([1000, 1100, 900, 1200, 1200]);
  });
});

describe("buildResultSummary — 최종 지표는 완료 시점에만 노출 (R6)", () => {
  it("재생 중(마지막 날 아님)에는 finalMetrics가 null이다", () => {
    const [row] = buildResultSummary(resultsByInstrumentId, instrumentsById, 2).filter(
      (r) => r.instrumentId === GOLDEN_INSTRUMENT.id,
    );

    expect(row.date).toBe("2024-01-03");
    expect(row.totalValue).toEqual({ amount: "900", currency: "USD" });
    expect(row.finalMetrics).toBeNull();
  });

  it("마지막 날에 도달하면 finalMetrics가 채워진다", () => {
    const [row] = buildResultSummary(resultsByInstrumentId, instrumentsById, 4).filter(
      (r) => r.instrumentId === GOLDEN_INSTRUMENT.id,
    );

    expect(row.finalMetrics).not.toBeNull();
    expect(row.finalMetrics?.finalReturnRate).toBe("0.2");
  });

  it("총자산 낙폭은 커서 시점까지의 값이다 (3일차 2/11)", () => {
    const [row] = buildResultSummary(resultsByInstrumentId, instrumentsById, 2).filter(
      (r) => r.instrumentId === GOLDEN_INSTRUMENT.id,
    );
    expect(row.drawdownRateToDate).toBe("0.1818181818");
  });
});

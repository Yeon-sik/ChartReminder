import { describe, expect, it } from "vitest";

import { GOLDEN_CANDLES, GOLDEN_INSTRUMENT } from "../../domain/fixtures/goldenFixture";
import type { Instrument } from "../../domain/instrument/instrument";
import type { Candle } from "../../domain/market-data/candle";
import { buildReplayDataset } from "../../domain/replay/replayDataset";
import { DomainValidationError } from "../../domain/shared/errors";
import type { UsdKrwRate } from "../../domain/shared/fxConversion";
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

const KRW_INSTRUMENT: Instrument = {
  ...GOLDEN_INSTRUMENT,
  id: "golden-krw",
  symbol: "KRWASSET",
  displayName: "KRW Asset",
  quoteCurrency: "KRW",
};

const RATE: UsdKrwRate = { krwPerUsd: "1400", asOfUtcMs: Date.UTC(2026, 0, 1) };

/** golden-alpha와 같은 타임라인에서 1/3부터만 상장한 자산(후행 상장 시나리오). */
const LATE_CANDLES: Candle[] = GOLDEN_CANDLES.filter((c) => c.tradingDate >= "2024-01-03").map(
  (c) => ({ ...c, instrumentId: LATE_INSTRUMENT.id }),
);
const KRW_CANDLES: Candle[] = GOLDEN_CANDLES.map((c) => ({
  ...c,
  instrumentId: KRW_INSTRUMENT.id,
  quoteCurrency: "KRW",
}));

const dataset = buildReplayDataset(
  [
    { instrumentId: GOLDEN_INSTRUMENT.id, candles: GOLDEN_CANDLES },
    { instrumentId: LATE_INSTRUMENT.id, candles: LATE_CANDLES },
    { instrumentId: KRW_INSTRUMENT.id, candles: KRW_CANDLES },
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

const krwLumpSumConfig: SimulationConfig = {
  ...lumpSumConfig,
  initialCash: { amount: "1000", currency: "KRW" },
};

function runFor(instrumentId: string, config: SimulationConfig = lumpSumConfig): SimulationResult {
  return runSimulation(buildSimulationDays(dataset, instrumentId), config);
}

const resultsByInstrumentId = {
  [GOLDEN_INSTRUMENT.id]: runFor(GOLDEN_INSTRUMENT.id),
  [LATE_INSTRUMENT.id]: runFor(LATE_INSTRUMENT.id),
};
const instrumentsById = {
  [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT,
  [LATE_INSTRUMENT.id]: LATE_INSTRUMENT,
};

// D-020 통화 환산 테스트 전용 — 위 공유 맵과 분리해 다른 테스트가 불필요한 환율 요구에 걸리지 않게 한다.
const krwResultsByInstrumentId = {
  [GOLDEN_INSTRUMENT.id]: runFor(GOLDEN_INSTRUMENT.id),
  [KRW_INSTRUMENT.id]: runFor(KRW_INSTRUMENT.id, krwLumpSumConfig),
};
const krwInstrumentsById = {
  [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT,
  [KRW_INSTRUMENT.id]: KRW_INSTRUMENT,
};

describe("buildPriceSeries — 미래 데이터 비노출 (R6)", () => {
  it("cursorIndex 이후 날짜는 절대 포함하지 않는다 (raw)", () => {
    const [series] = buildPriceSeries(
      dataset,
      { [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT },
      "raw",
      2,
      "USD",
      null,
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
      "USD",
      null,
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
      "USD",
      null,
    );
    expect(series.points.map((p) => p.value)).toEqual([100, 110, 90]);
  });

  it("cumulative-return 모드: 첫 값 대비 %로 변환한다", () => {
    const [series] = buildPriceSeries(
      dataset,
      { [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT },
      "cumulative-return",
      2,
      "USD",
      null,
    );
    expect(series.points.map((p) => p.value)).toEqual([0, 10, -10]);
  });

  it("raw 모드는 표시 통화가 다르면 환산한다 (D-020)", () => {
    const [series] = buildPriceSeries(
      dataset,
      { [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT },
      "raw",
      2,
      "KRW",
      RATE,
    );
    expect(series.points.map((p) => p.value)).toEqual([140000, 154000, 126000]);
  });

  it("raw 모드에서 환산이 필요한데 환율이 없으면 예외를 던진다", () => {
    expect(() =>
      buildPriceSeries(
        dataset,
        { [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT },
        "raw",
        2,
        "KRW",
        null,
      ),
    ).toThrow(DomainValidationError);
  });

  it("상장 이전 구간은 포인트 자체가 없다 (0으로 채우지 않음)", () => {
    const [series] = buildPriceSeries(
      dataset,
      { [LATE_INSTRUMENT.id]: LATE_INSTRUMENT },
      "raw",
      1,
      "USD",
      null,
    );
    expect(series.points).toEqual([]);
  });

  it("상장일 이후에는 상장일부터 포인트가 시작된다", () => {
    const [series] = buildPriceSeries(
      dataset,
      { [LATE_INSTRUMENT.id]: LATE_INSTRUMENT },
      "raw",
      3,
      "USD",
      null,
    );
    expect(series.points.map((p) => p.time)).toEqual(["2024-01-03", "2024-01-04"]);
  });

  it("자산 라벨은 표시명과 심볼을 포함한다", () => {
    const [series] = buildPriceSeries(
      dataset,
      { [GOLDEN_INSTRUMENT.id]: GOLDEN_INSTRUMENT },
      "raw",
      0,
      "USD",
      null,
    );
    expect(series.label).toBe("Golden Fixture Alpha (ALPHA)");
  });
});

describe("buildPortfolioSeries — 미래 데이터 비노출 (R6)", () => {
  it("cursorIndex 이후 스냅샷은 포함하지 않는다", () => {
    const [series] = buildPortfolioSeries(
      resultsByInstrumentId,
      instrumentsById,
      2,
      "USD",
      null,
    ).filter((s) => s.instrumentId === GOLDEN_INSTRUMENT.id);

    expect(series.totalValue.map((p) => p.value)).toEqual([1000, 1100, 900]);
    expect(series.totalValue).toHaveLength(3);
  });

  it("완료 시점(cursorIndex=4)에는 전체 스냅샷이 드러난다", () => {
    const [series] = buildPortfolioSeries(
      resultsByInstrumentId,
      instrumentsById,
      4,
      "USD",
      null,
    ).filter((s) => s.instrumentId === GOLDEN_INSTRUMENT.id);
    expect(series.totalValue.map((p) => p.value)).toEqual([1000, 1100, 900, 1200, 1200]);
  });

  it("표시 통화가 다른 자산은 환산된 값으로 나온다 (D-020)", () => {
    const [series] = buildPortfolioSeries(
      krwResultsByInstrumentId,
      krwInstrumentsById,
      4,
      "USD",
      RATE,
    ).filter((s) => s.instrumentId === KRW_INSTRUMENT.id);
    // KRW 1000 → USD 1000/1400, 이후 총자산도 같은 비율로 환산
    expect(series.totalValue[0].value).toBeCloseTo(1000 / 1400, 6);
  });
});

describe("buildResultSummary — 최종 지표는 완료 시점에만 노출 (R6)", () => {
  it("재생 중(마지막 날 아님)에는 finalMetrics가 null이다", () => {
    const [row] = buildResultSummary(resultsByInstrumentId, instrumentsById, 2, "USD", null).filter(
      (r) => r.instrumentId === GOLDEN_INSTRUMENT.id,
    );

    expect(row.date).toBe("2024-01-03");
    expect(row.totalValue).toEqual({ amount: "900", currency: "USD" });
    expect(row.finalMetrics).toBeNull();
  });

  it("마지막 날에 도달하면 finalMetrics가 채워진다", () => {
    const [row] = buildResultSummary(resultsByInstrumentId, instrumentsById, 4, "USD", null).filter(
      (r) => r.instrumentId === GOLDEN_INSTRUMENT.id,
    );

    expect(row.finalMetrics).not.toBeNull();
    expect(row.finalMetrics?.finalReturnRate).toBe("0.2");
  });

  it("총자산 낙폭은 커서 시점까지의 값이다 (3일차 2/11)", () => {
    const [row] = buildResultSummary(resultsByInstrumentId, instrumentsById, 2, "USD", null).filter(
      (r) => r.instrumentId === GOLDEN_INSTRUMENT.id,
    );
    expect(row.drawdownRateToDate).toBe("0.1818181818");
  });

  it("표시 통화로 환산된 Money를 반환한다 (D-020) — currency 라벨도 바뀐다", () => {
    const [row] = buildResultSummary(
      krwResultsByInstrumentId,
      krwInstrumentsById,
      2,
      "KRW",
      RATE,
    ).filter((r) => r.instrumentId === GOLDEN_INSTRUMENT.id);
    expect(row.totalValue).toEqual({ amount: "1260000", currency: "KRW" }); // 900 * 1400
  });
});

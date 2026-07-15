import { describe, expect, it } from "vitest";

import {
  GOLDEN_CANDLES,
  GOLDEN_DCA_WEEKLY_EXPECTED,
  GOLDEN_INSTRUMENT,
  GOLDEN_LUMP_SUM_EXPECTED,
  GOLDEN_LUMP_SUM_FEE_EXPECTED,
} from "../fixtures/goldenFixture";
import { buildReplayDataset } from "../replay/replayDataset";
import type { SimulationConfig } from "./simulationConfig";
import { runSimulation, type SimulationResult } from "./simulationEngine";
import { buildSimulationDays } from "./simulationTimeline";

/**
 * 이 파일은 M4 엔진 결과를 docs/16_GOLDEN_FIXTURES.md의 손 계산 값(goldenFixture.ts에
 * 상수로 옮긴 값)과 전사 대조한다. 기대값은 이 엔진으로 생성하지 않았다 (docs/08 §3).
 */

const USD = (amount: string) => ({ amount, currency: "USD" });

const dataset = buildReplayDataset(
  [{ instrumentId: GOLDEN_INSTRUMENT.id, candles: GOLDEN_CANDLES }],
  { interval: "1d" },
);
const days = buildSimulationDays(dataset, GOLDEN_INSTRUMENT.id);

function snapshotByDate(result: SimulationResult, date: string) {
  const snapshot = result.snapshots.find((s) => s.date === date);
  if (snapshot === undefined) {
    throw new Error(`스냅샷이 없다: ${date}`);
  }
  return snapshot;
}

describe("Golden Fixture 대조 — 일시투자", () => {
  const config: SimulationConfig = {
    mode: "lump-sum",
    initialCash: USD(GOLDEN_LUMP_SUM_EXPECTED.initialCash),
    executionPrice: "close",
    feeRate: GOLDEN_LUMP_SUM_EXPECTED.feeRate,
    allowFractionalQuantity: true,
    dividendPolicy: "ignore",
  };
  const result = runSimulation(days, config);

  it("첫 거래일 종가로 전액 매수하고 잔여 현금이 없다", () => {
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      date: GOLDEN_LUMP_SUM_EXPECTED.buyTradingDate,
      executionPrice: GOLDEN_LUMP_SUM_EXPECTED.executionPrice,
      quantity: GOLDEN_LUMP_SUM_EXPECTED.quantity,
      fee: USD("0"),
    });
    expect(snapshotByDate(result, GOLDEN_LUMP_SUM_EXPECTED.buyTradingDate).cash).toEqual(
      USD(GOLDEN_LUMP_SUM_EXPECTED.remainingCash),
    );
  });

  it("날짜별 총자산·손익·수익률·낙폭이 손 계산과 일치한다", () => {
    for (const expectedDay of GOLDEN_LUMP_SUM_EXPECTED.days) {
      const snapshot = snapshotByDate(result, expectedDay.date);
      expect(snapshot.totalValue).toEqual(USD(expectedDay.totalValue));
      expect(snapshot.profitLoss).toEqual(USD(expectedDay.profitLoss));
      expect(snapshot.returnRate).toBe(expectedDay.returnRate);
      expect(snapshot.drawdownRate).toBe(expectedDay.drawdownRate);
    }
  });

  it("최대 낙폭이 손 계산(2/11)과 일치한다 (일시투자는 가격·총자산 MDD가 같다)", () => {
    expect(result.metrics.maxDrawdownTotalValue).toBe(GOLDEN_LUMP_SUM_EXPECTED.maxDrawdownRate);
    expect(result.metrics.maxDrawdownPrice).toBe(GOLDEN_LUMP_SUM_EXPECTED.maxDrawdownRate);
  });
});

describe("Golden Fixture 대조 — 일시투자 + 수수료 25%", () => {
  const config: SimulationConfig = {
    mode: "lump-sum",
    initialCash: USD(GOLDEN_LUMP_SUM_FEE_EXPECTED.initialCash),
    executionPrice: "close",
    feeRate: GOLDEN_LUMP_SUM_FEE_EXPECTED.feeRate,
    allowFractionalQuantity: true,
    dividendPolicy: "ignore",
  };
  const result = runSimulation(days, config);

  it("수수료를 뺀 금액으로 매수하고 잔여 현금이 없다", () => {
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      quantity: GOLDEN_LUMP_SUM_FEE_EXPECTED.quantity,
      grossAmount: USD(GOLDEN_LUMP_SUM_FEE_EXPECTED.grossAmount),
      fee: USD(GOLDEN_LUMP_SUM_FEE_EXPECTED.fee),
    });
    expect(snapshotByDate(result, GOLDEN_CANDLES[0].tradingDate).cash).toEqual(
      USD(GOLDEN_LUMP_SUM_FEE_EXPECTED.remainingCash),
    );
  });

  it("날짜별 총자산·손익·수익률·낙폭이 손 계산과 일치한다", () => {
    for (const expectedDay of GOLDEN_LUMP_SUM_FEE_EXPECTED.days) {
      const snapshot = snapshotByDate(result, expectedDay.date);
      expect(snapshot.totalValue).toEqual(USD(expectedDay.totalValue));
      expect(snapshot.profitLoss).toEqual(USD(expectedDay.profitLoss));
      expect(snapshot.returnRate).toBe(expectedDay.returnRate);
      expect(snapshot.drawdownRate).toBe(expectedDay.drawdownRate);
    }
  });

  it("최종 수익률과 낙폭이 손 계산과 일치한다", () => {
    expect(result.metrics.finalReturnRate).toBe(GOLDEN_LUMP_SUM_FEE_EXPECTED.finalReturnRate);
    expect(result.metrics.maxDrawdownTotalValue).toBe(
      GOLDEN_LUMP_SUM_FEE_EXPECTED.maxDrawdownTotalValue,
    );
    expect(result.metrics.maxDrawdownPrice).toBe(GOLDEN_LUMP_SUM_FEE_EXPECTED.maxDrawdownPrice);
  });
});

describe("Golden Fixture 대조 — 매주 정기매수 (수요일, 450, 수수료 0)", () => {
  const config: SimulationConfig = {
    mode: "dca",
    initialCash: USD(GOLDEN_DCA_WEEKLY_EXPECTED.initialCash),
    recurring: {
      amount: USD(GOLDEN_DCA_WEEKLY_EXPECTED.recurringAmount),
      frequency: "weekly",
      anchor: { kind: "day-of-week", isoDayOfWeek: GOLDEN_DCA_WEEKLY_EXPECTED.anchorIsoDayOfWeek },
    },
    executionPrice: "close",
    feeRate: GOLDEN_DCA_WEEKLY_EXPECTED.feeRate,
    allowFractionalQuantity: true,
    dividendPolicy: "ignore",
  };
  const result = runSimulation(days, config);

  it("유일한 예정일(2024-01-03)에 한 번만 체결한다", () => {
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      date: "2024-01-03",
      quantity: GOLDEN_DCA_WEEKLY_EXPECTED.quantity,
      reason: "scheduled",
    });
  });

  it("날짜별 기여 원금·총자산·수익률·낙폭이 손 계산과 일치한다", () => {
    for (const expectedDay of GOLDEN_DCA_WEEKLY_EXPECTED.days) {
      const snapshot = snapshotByDate(result, expectedDay.date);
      expect(snapshot.contributedCapital).toEqual(USD(expectedDay.contributedCapital));
      expect(snapshot.totalValue).toEqual(USD(expectedDay.totalValue));
      expect(snapshot.returnRate).toBe(expectedDay.returnRate);
      expect(snapshot.drawdownRate).toBe(expectedDay.drawdownRate);
    }
  });

  it("총자산 MDD(0)와 가격 MDD(2/11)가 갈라지는 사례를 재현한다 (D-012)", () => {
    expect(result.metrics.finalReturnRate).toBe(GOLDEN_DCA_WEEKLY_EXPECTED.finalReturnRate);
    expect(result.metrics.maxDrawdownTotalValue).toBe(
      GOLDEN_DCA_WEEKLY_EXPECTED.maxDrawdownTotalValue,
    );
    expect(result.metrics.maxDrawdownPrice).toBe(GOLDEN_DCA_WEEKLY_EXPECTED.maxDrawdownPrice);
  });
});

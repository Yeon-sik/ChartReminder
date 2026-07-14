import { describe, expect, it } from "vitest";

import { assertValidCandle, candleDuplicateKey } from "../market-data/candle";
import { unionTradingDates } from "../replay/timeline";
import { parseDecimal, roundHalfUp, toDecimalString } from "../shared/decimal";
import { utcTradingDateFromUtcMs } from "../shared/time";
import { GOLDEN_CANDLES, GOLDEN_INSTRUMENT, GOLDEN_LUMP_SUM_EXPECTED } from "./goldenFixture";

describe("Golden Fixture 데이터셋", () => {
  it("5일 고정 데이터다", () => {
    expect(GOLDEN_CANDLES).toHaveLength(5);
  });

  it("모든 캔들이 도메인 불변조건을 만족한다", () => {
    for (const candle of GOLDEN_CANDLES) {
      expect(() => assertValidCandle(candle)).not.toThrow();
    }
  });

  it("종가 경로가 100 → 110 → 90 → 120 → 120이다", () => {
    expect(GOLDEN_CANDLES.map((candle) => candle.close)).toEqual([
      "100",
      "110",
      "90",
      "120",
      "120",
    ]);
  });

  it("시간이 오름차순이고 중복 키가 없다", () => {
    for (let i = 1; i < GOLDEN_CANDLES.length; i += 1) {
      expect(GOLDEN_CANDLES[i].openTimeUtcMs).toBeGreaterThan(GOLDEN_CANDLES[i - 1].openTimeUtcMs);
    }
    const keys = new Set(GOLDEN_CANDLES.map(candleDuplicateKey));
    expect(keys.size).toBe(GOLDEN_CANDLES.length);
  });

  it("openTimeUtcMs가 각 거래일의 UTC 자정과 일치한다", () => {
    for (const candle of GOLDEN_CANDLES) {
      expect(utcTradingDateFromUtcMs(candle.openTimeUtcMs)).toBe(candle.tradingDate);
      const [year, month, day] = candle.tradingDate.split("-").map(Number);
      expect(candle.openTimeUtcMs).toBe(Date.UTC(year, month - 1, day));
    }
  });

  it("자산 메타데이터와 캔들이 일치한다", () => {
    for (const candle of GOLDEN_CANDLES) {
      expect(candle.instrumentId).toBe(GOLDEN_INSTRUMENT.id);
      expect(candle.quoteCurrency).toBe(GOLDEN_INSTRUMENT.quoteCurrency);
      expect(candle.source.providerId).toBe(GOLDEN_INSTRUMENT.providerId);
    }
  });

  it("타임라인 합집합이 fixture 거래일과 같다", () => {
    const timeline = unionTradingDates([GOLDEN_CANDLES.map((candle) => candle.tradingDate)]);
    expect(timeline).toEqual(GOLDEN_LUMP_SUM_EXPECTED.days.map((day) => day.date));
  });
});

// 기대값 자체는 docs/16_GOLDEN_FIXTURES.md의 손 계산에서 온다.
// 아래는 시뮬레이션 엔진 구현이 아닌 기초 산술만으로 문서 값의 전사 오류를 잡는 교차 검증이다.
describe("Golden Fixture 일시투자 기대값 교차 검증", () => {
  const expected = GOLDEN_LUMP_SUM_EXPECTED;
  const initialCash = parseDecimal(expected.initialCash);
  const quantity = parseDecimal(expected.quantity);

  it("수량 = 원금 ÷ 체결가", () => {
    const computed = initialCash.dividedBy(parseDecimal(expected.executionPrice));
    expect(toDecimalString(computed)).toBe(expected.quantity);
  });

  it("체결가는 첫 거래일 종가이고 잔여 현금은 0이다", () => {
    expect(expected.executionPrice).toBe(GOLDEN_CANDLES[0].close);
    expect(expected.buyTradingDate).toBe(GOLDEN_CANDLES[0].tradingDate);
    expect(expected.remainingCash).toBe("0");
  });

  it("날짜별 평가액 = 수량 × 종가, 손익·수익률이 일관된다", () => {
    expect(expected.days).toHaveLength(GOLDEN_CANDLES.length);
    expected.days.forEach((day, index) => {
      expect(day.date).toBe(GOLDEN_CANDLES[index].tradingDate);
      const totalValue = quantity.times(parseDecimal(GOLDEN_CANDLES[index].close));
      expect(toDecimalString(totalValue)).toBe(day.totalValue);
      const profitLoss = totalValue.minus(initialCash);
      expect(toDecimalString(profitLoss)).toBe(day.profitLoss);
      const returnRate = profitLoss.dividedBy(initialCash);
      expect(toDecimalString(returnRate)).toBe(day.returnRate);
    });
  });

  it("날짜별 낙폭 = (이전 최고 총자산 − 총자산) ÷ 이전 최고", () => {
    let peak = parseDecimal(expected.days[0].totalValue);
    for (const day of expected.days) {
      const totalValue = parseDecimal(day.totalValue);
      if (totalValue.greaterThan(peak)) {
        peak = totalValue;
      }
      const drawdown = roundHalfUp(
        peak.minus(totalValue).dividedBy(peak),
        expected.rateDecimalPlaces,
      );
      expect(toDecimalString(drawdown)).toBe(day.drawdownRate);
    }
  });

  it("최대 낙폭은 3일차 낙폭(2/11)이다", () => {
    const maxOfDays = expected.days
      .map((day) => parseDecimal(day.drawdownRate))
      .reduce((max, rate) => (rate.greaterThan(max) ? rate : max));
    expect(toDecimalString(maxOfDays)).toBe(expected.maxDrawdownRate);
    const exact = roundHalfUp(
      parseDecimal("2").dividedBy(parseDecimal("11")),
      expected.rateDecimalPlaces,
    );
    expect(toDecimalString(exact)).toBe(expected.maxDrawdownRate);
  });
});

import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../shared/errors";
import type { SimulationConfig } from "./simulationConfig";
import { RATE_DECIMAL_PLACES, runSimulation } from "./simulationEngine";
import type { SimulationDay, ValuationPrice } from "./simulationTimeline";

const USD = (amount: string) => ({ amount, currency: "USD" });

function fresh(date: string, value: string): ValuationPrice {
  return { value, status: "fresh", observedAt: date };
}

function carried(value: string, observedAt: string): ValuationPrice {
  return { value, status: "carried-forward", observedAt };
}

function day(
  date: string,
  executionPrice: string | null,
  valuationPrice: ValuationPrice | null,
): SimulationDay {
  return { date, executionPrice, valuationPrice };
}

function lumpSumConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    mode: "lump-sum",
    initialCash: USD("1000"),
    executionPrice: "close",
    feeRate: "0",
    allowFractionalQuantity: true,
    dividendPolicy: "ignore",
    ...overrides,
  };
}

function dcaConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    mode: "dca",
    initialCash: USD("0"),
    recurring: {
      amount: USD("450"),
      frequency: "weekly",
      anchor: { kind: "day-of-week", isoDayOfWeek: 3 }, // 수요일
    },
    executionPrice: "close",
    feeRate: "0",
    allowFractionalQuantity: true,
    dividendPolicy: "ignore",
    ...overrides,
  };
}

describe("runSimulation — 일시투자 1개 캔들", () => {
  it("단일 거래일에 매수·평가가 완료된다", () => {
    const days = [day("2024-01-01", "100", fresh("2024-01-01", "100"))];
    const result = runSimulation(days, lumpSumConfig());

    expect(result.trades).toEqual([
      {
        id: "trade-1",
        date: "2024-01-01",
        type: "buy",
        executionPrice: "100",
        grossAmount: USD("1000"),
        fee: USD("0"),
        quantity: "10",
        reason: "initial",
      },
    ]);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]).toMatchObject({
      contributedCapital: USD("1000"),
      cash: USD("0"),
      positionQuantity: "10",
      marketValue: USD("1000"),
      totalValue: USD("1000"),
      profitLoss: USD("0"),
      returnRate: "0",
      drawdownRate: "0",
    });
    expect(result.metrics.finalReturnRate).toBe("0");
  });
});

describe("runSimulation — 잔여 현금 (소수점 비허용)", () => {
  it("정수 수량만 매수하고 남은 현금을 보존한다", () => {
    const days = [day("2024-01-01", "30", fresh("2024-01-01", "30"))];
    const config = lumpSumConfig({ initialCash: USD("100"), allowFractionalQuantity: false });
    const result = runSimulation(days, config);

    // floor(100 / 30) = 3, gross = 90, 잔여 현금 = 10
    expect(result.trades[0]).toMatchObject({
      quantity: "3",
      grossAmount: USD("90"),
      fee: USD("0"),
    });
    expect(result.snapshots[0]).toMatchObject({
      cash: USD("10"),
      positionQuantity: "3",
      marketValue: USD("90"),
      totalValue: USD("100"),
    });
  });

  it("정수 수량 1개도 못 사면 매수 없이 전액 현금으로 남긴다", () => {
    const days = [day("2024-01-01", "200", fresh("2024-01-01", "200"))];
    const config = lumpSumConfig({ initialCash: USD("100"), allowFractionalQuantity: false });
    const result = runSimulation(days, config);

    expect(result.trades).toEqual([]);
    expect(result.snapshots[0]).toMatchObject({
      cash: USD("100"),
      positionQuantity: "0",
      marketValue: USD("0"),
      totalValue: USD("100"),
    });
  });
});

describe("runSimulation — 소수점 매수 허용", () => {
  it("소수점 수량을 허용하면 현금을 전액 소진한다", () => {
    const days = [day("2024-01-01", "30", fresh("2024-01-01", "30"))];
    const config = lumpSumConfig({ initialCash: USD("100"), allowFractionalQuantity: true });
    const result = runSimulation(days, config);

    // 100/30 = 3.333… 소수점 비허용과 달리 잘라내지 않고 precision 34까지 보존한다
    expect(result.trades[0].quantity).toMatch(/^3\.3{30,}$/);
    expect(result.snapshots[0].cash).toEqual(USD("0"));
  });
});

describe("runSimulation — 수수료 0과 양수", () => {
  it("수수료 0이면 fee가 0이고 gross가 amount와 같다", () => {
    const days = [day("2024-01-01", "100", fresh("2024-01-01", "100"))];
    const result = runSimulation(days, lumpSumConfig({ feeRate: "0" }));
    expect(result.trades[0]).toMatchObject({ fee: USD("0"), grossAmount: USD("1000") });
  });

  it("수수료가 양수면 gross+fee가 납입액을 넘지 않는다 (소수점 허용)", () => {
    // amount=1050, feeRate=0.05 → gross = 1050/1.05 = 1000, fee = 50, quantity = 1000/100 = 10
    const days = [day("2024-01-01", "100", fresh("2024-01-01", "100"))];
    const config = lumpSumConfig({ initialCash: USD("1050"), feeRate: "0.05" });
    const result = runSimulation(days, config);

    expect(result.trades[0]).toMatchObject({
      grossAmount: USD("1000"),
      fee: USD("50"),
      quantity: "10",
    });
    expect(result.snapshots[0].cash).toEqual(USD("0"));
  });
});

describe("runSimulation — 매주·매월 정기매수 스케줄", () => {
  it("매주 스케줄이 예정일마다 개별 거래를 만든다", () => {
    // 2024-01-01은 월요일. 수요일(3) 예정일: 1/3, 1/10
    const days = [
      day("2024-01-01", "100", fresh("2024-01-01", "100")),
      day("2024-01-02", "100", fresh("2024-01-02", "100")),
      day("2024-01-03", "100", fresh("2024-01-03", "100")),
      day("2024-01-08", "100", fresh("2024-01-08", "100")),
      day("2024-01-09", "100", fresh("2024-01-09", "100")),
      day("2024-01-10", "100", fresh("2024-01-10", "100")),
    ];
    const result = runSimulation(days, dcaConfig());

    expect(result.trades.map((t) => t.date)).toEqual(["2024-01-03", "2024-01-10"]);
    expect(result.trades.every((t) => t.reason === "scheduled")).toBe(true);
  });

  it("매월 스케줄이 각 달의 기준일에 실행된다", () => {
    const config = dcaConfig({
      recurring: {
        amount: USD("450"),
        frequency: "monthly",
        anchor: { kind: "day-of-month", dayOfMonth: 15 },
      },
    });
    const days = [
      day("2024-01-15", "100", fresh("2024-01-15", "100")),
      day("2024-02-15", "100", fresh("2024-02-15", "100")),
      day("2024-03-15", "100", fresh("2024-03-15", "100")),
    ];
    const result = runSimulation(days, config);

    expect(result.trades.map((t) => t.date)).toEqual(["2024-01-15", "2024-02-15", "2024-03-15"]);
  });

  it("여러 예정일이 누락된 채 하나의 유효 거래일에 몰리면 거래 기록을 분리한다", () => {
    // 매주 월요일(1) 예정일: 1/1, 1/8 모두 휴장(executionPrice null), 1/9에 처음 체결
    const config = dcaConfig({
      recurring: {
        amount: USD("100"),
        frequency: "weekly",
        anchor: { kind: "day-of-week", isoDayOfWeek: 1 },
      },
    });
    const days = [
      day("2024-01-01", null, null),
      day("2024-01-08", null, null),
      day("2024-01-09", "100", fresh("2024-01-09", "100")),
    ];
    const result = runSimulation(days, config);

    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({ id: "trade-1", date: "2024-01-09", quantity: "1" });
    expect(result.trades[1]).toMatchObject({ id: "trade-2", date: "2024-01-09", quantity: "1" });
    expect(result.snapshots[2]).toMatchObject({
      contributedCapital: USD("200"),
      cash: USD("0"),
      positionQuantity: "2",
    });
  });
});

describe("runSimulation — 휴장일 이월", () => {
  it("예정일에 캔들이 없으면 이후 첫 유효 거래일에 실행한다", () => {
    const days = [
      day("2024-01-01", "100", fresh("2024-01-01", "100")),
      day("2024-01-02", "110", fresh("2024-01-02", "110")),
      day("2024-01-03", null, carried("110", "2024-01-02")), // 수요일 예정일, 휴장
      day("2024-01-04", "120", fresh("2024-01-04", "120")),
      day("2024-01-05", "120", fresh("2024-01-05", "120")),
    ];
    const result = runSimulation(days, dcaConfig());

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ date: "2024-01-04", executionPrice: "120" });
    expect(result.snapshots[2]).toMatchObject({
      contributedCapital: USD("450"),
      cash: USD("450"),
      positionQuantity: "0",
    });
    expect(result.snapshots[3]).toMatchObject({
      cash: USD("0"),
      positionQuantity: "3.75", // 450 / 120
    });
  });
});

describe("runSimulation — 상장 이전 기간", () => {
  it("관측된 가격이 없는 기간은 매수·평가 없이 0으로 유지한다", () => {
    const config = dcaConfig({
      recurring: {
        amount: USD("450"),
        frequency: "weekly",
        anchor: { kind: "day-of-week", isoDayOfWeek: 1 }, // 월요일: 1/1
      },
    });
    const days = [
      day("2024-01-01", null, null), // 상장 전, 예정일이지만 실행 불가
      day("2024-01-02", null, null),
      day("2024-01-03", "100", fresh("2024-01-03", "100")), // 상장일
    ];
    const result = runSimulation(days, config);

    expect(result.snapshots[0]).toMatchObject({
      contributedCapital: USD("450"),
      cash: USD("450"),
      positionQuantity: "0",
      marketValue: USD("0"),
      totalValue: USD("450"),
    });
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].date).toBe("2024-01-03");
  });
});

describe("runSimulation — 데이터 중간 누락과 carried-forward 평가", () => {
  it("캔들이 없는 날은 마지막 관측 가격을 carried-forward로 평가한다", () => {
    const days = [
      day("2024-01-01", "100", fresh("2024-01-01", "100")),
      day("2024-01-02", null, carried("100", "2024-01-01")),
      day("2024-01-03", "120", fresh("2024-01-03", "120")),
    ];
    const result = runSimulation(days, lumpSumConfig());

    expect(result.snapshots[1].priceStatus).toBe("carried-forward");
    expect(result.snapshots[1].marketValue).toEqual(USD("1000")); // quantity 10 * carried 100
    expect(result.snapshots[0].priceStatus).toBe("fresh");
    expect(result.snapshots[2].priceStatus).toBe("fresh");
  });

  it("보유 수량이 있는데 평가 가격이 없으면 오류다 (어댑터 입력 오류 방어)", () => {
    const days = [
      day("2024-01-01", "100", fresh("2024-01-01", "100")),
      day("2024-01-02", null, null),
    ];
    expect(() => runSimulation(days, lumpSumConfig())).toThrow(DomainValidationError);
  });
});

describe("runSimulation — Decimal 반올림 정책", () => {
  it("비율은 소수 10자리 ROUND_HALF_UP으로 표기한다 (11번째 자리 반올림)", () => {
    expect(RATE_DECIMAL_PLACES).toBe(10);
    // quantity = 1/3 (가격 3), day2 평가액 = 5/3, 손익 = 2/3, 수익률 = 2/3
    // = 0.66666666666...  → 10자리에서 반올림하면 11번째 자리(6)가 올림해 ...667
    const days = [
      day("2024-01-01", "3", fresh("2024-01-01", "3")),
      day("2024-01-02", "5", fresh("2024-01-02", "5")),
    ];
    const result = runSimulation(days, lumpSumConfig({ initialCash: USD("1") }));

    expect(result.snapshots[1].returnRate).toBe("0.6666666667");
  });
});

describe("runSimulation — 0원 원금", () => {
  it("0원 일시투자는 거래 없이 0 스냅샷을 만든다", () => {
    const days = [day("2024-01-01", "100", fresh("2024-01-01", "100"))];
    const result = runSimulation(days, lumpSumConfig({ initialCash: USD("0") }));

    expect(result.trades).toEqual([]);
    expect(result.snapshots[0]).toMatchObject({
      contributedCapital: USD("0"),
      cash: USD("0"),
      positionQuantity: "0",
      totalValue: USD("0"),
      returnRate: "0",
    });
  });
});

describe("runSimulation — 음수 입력·빈 기간 거부", () => {
  it("음수 initialCash를 거부한다", () => {
    const days = [day("2024-01-01", "100", fresh("2024-01-01", "100"))];
    expect(() => runSimulation(days, lumpSumConfig({ initialCash: USD("-1") }))).toThrow(
      DomainValidationError,
    );
  });

  it("빈 기간을 거부한다", () => {
    expect(() => runSimulation([], lumpSumConfig())).toThrow(DomainValidationError);
  });

  it("0 이하 체결 가격으로는 매수할 수 없다", () => {
    const days = [day("2024-01-01", "0", fresh("2024-01-01", "0"))];
    expect(() => runSimulation(days, lumpSumConfig())).toThrow(DomainValidationError);
  });
});

describe("runSimulation — 최종 수익률 독립 계산과 일치", () => {
  it("정수로 나누어떨어지는 손 계산 사례와 일치한다", () => {
    // 원금 500, 가격 50 → 수량 10. 가격이 75로 오르면 평가액 750, 손익 250, 수익률 250/500=0.5
    const days = [
      day("2024-01-01", "50", fresh("2024-01-01", "50")),
      day("2024-01-02", "75", fresh("2024-01-02", "75")),
    ];
    const result = runSimulation(days, lumpSumConfig({ initialCash: USD("500") }));

    expect(result.snapshots[1].returnRate).toBe("0.5");
    expect(result.metrics.finalReturnRate).toBe("0.5");
  });
});

describe("runSimulation — 재실행 결정론", () => {
  it("같은 입력으로 두 번 실행하면 완전히 동일한 결과를 만든다", () => {
    const days = [
      day("2024-01-01", "100", fresh("2024-01-01", "100")),
      day("2024-01-02", "110", fresh("2024-01-02", "110")),
      day("2024-01-03", null, carried("110", "2024-01-02")),
      day("2024-01-04", "120", fresh("2024-01-04", "120")),
      day("2024-01-05", "120", fresh("2024-01-05", "120")),
    ];
    const config = dcaConfig({ initialCash: USD("200"), feeRate: "0.01" });

    const first = runSimulation(days, config);
    const second = runSimulation(days, config);

    expect(second).toEqual(first);
  });
});

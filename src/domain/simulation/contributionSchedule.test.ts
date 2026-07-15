import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../shared/errors";
import { generateContributionDates } from "./contributionSchedule";
import type { RecurringPlan } from "./simulationConfig";

const USD = { amount: "100", currency: "USD" };

function weekly(isoDayOfWeek: number): RecurringPlan {
  return { amount: USD, frequency: "weekly", anchor: { kind: "day-of-week", isoDayOfWeek } };
}

function monthly(dayOfMonth: number): RecurringPlan {
  return { amount: USD, frequency: "monthly", anchor: { kind: "day-of-month", dayOfMonth } };
}

describe("generateContributionDates — 매주", () => {
  it("기간 내 해당 요일을 모두 나열한다 (2024-01-01은 월요일)", () => {
    expect(generateContributionDates(weekly(3), "2024-01-01", "2024-01-31")).toEqual([
      "2024-01-03",
      "2024-01-10",
      "2024-01-17",
      "2024-01-24",
      "2024-01-31",
    ]);
  });

  it("시작일이 기준 요일이면 시작일을 포함한다", () => {
    expect(generateContributionDates(weekly(1), "2024-01-01", "2024-01-15")).toEqual([
      "2024-01-01",
      "2024-01-08",
      "2024-01-15",
    ]);
  });

  it("연도 경계를 넘는다", () => {
    expect(generateContributionDates(weekly(7), "2023-12-25", "2024-01-08")).toEqual([
      "2023-12-31",
      "2024-01-07",
    ]);
  });

  it("기간 내 해당 요일이 없으면 빈 배열이다", () => {
    expect(generateContributionDates(weekly(7), "2024-01-01", "2024-01-05")).toEqual([]);
  });
});

describe("generateContributionDates — 매월", () => {
  it("각 달의 기준일을 나열하고, 없는 날짜는 말일로 당긴다 (윤년 포함)", () => {
    expect(generateContributionDates(monthly(31), "2024-01-01", "2024-04-30")).toEqual([
      "2024-01-31",
      "2024-02-29", // 2024는 윤년
      "2024-03-31",
      "2024-04-30",
    ]);
  });

  it("평년 2월은 28일로 당긴다", () => {
    expect(generateContributionDates(monthly(30), "2023-02-01", "2023-03-31")).toEqual([
      "2023-02-28",
      "2023-03-30",
    ]);
  });

  it("시작일 이전의 기준일은 제외한다", () => {
    expect(generateContributionDates(monthly(15), "2024-01-20", "2024-03-31")).toEqual([
      "2024-02-15",
      "2024-03-15",
    ]);
  });

  it("시작일이 기준일이면 포함한다", () => {
    expect(generateContributionDates(monthly(1), "2024-01-01", "2024-02-15")).toEqual([
      "2024-01-01",
      "2024-02-01",
    ]);
  });
});

describe("generateContributionDates — 오류", () => {
  it("뒤집힌 기간을 거부한다", () => {
    expect(() => generateContributionDates(weekly(1), "2024-02-01", "2024-01-01")).toThrow(
      DomainValidationError,
    );
  });

  it("주기와 anchor 종류 불일치를 거부한다", () => {
    const mismatched: RecurringPlan = {
      amount: USD,
      frequency: "weekly",
      anchor: { kind: "day-of-month", dayOfMonth: 1 },
    };
    expect(() => generateContributionDates(mismatched, "2024-01-01", "2024-01-31")).toThrow(
      DomainValidationError,
    );
  });
});

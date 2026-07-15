import { DomainValidationError } from "../shared/errors";
import {
  addDaysToTradingDate,
  assertTradingDate,
  daysInMonth,
  isoDayOfWeek,
  tradingDateParts,
  type TradingDate,
} from "../shared/time";
import type { RecurringPlan } from "./simulationConfig";

/**
 * 정기 납입 예정일(달력일) 목록을 만든다. (docs/05 §4)
 *
 * - 예정일은 달력 기준이며 거래 가능 여부와 무관하다. 휴장·데이터 없음 이월은
 *   엔진이 처리한다 (예정일 이후 첫 유효 거래일 실행).
 * - 매주: 기간 내 해당 ISO 요일 전부. 시작일이 해당 요일이면 포함한다.
 * - 매월: 각 달의 anchor일. 그 달에 없는 날짜(예: 31일)는 말일로 당긴다.
 */
export function generateContributionDates(
  plan: RecurringPlan,
  startDate: TradingDate,
  endDate: TradingDate,
): TradingDate[] {
  assertTradingDate(startDate, "startDate");
  assertTradingDate(endDate, "endDate");
  if (startDate > endDate) {
    throw new DomainValidationError(`기간이 뒤집혔다: ${startDate} > ${endDate}`);
  }

  if (plan.frequency === "weekly") {
    if (plan.anchor.kind !== "day-of-week") {
      throw new DomainValidationError("매주 플랜의 anchor가 day-of-week가 아니다");
    }
    const targetDow = plan.anchor.isoDayOfWeek;
    const offset = (targetDow - isoDayOfWeek(startDate) + 7) % 7;
    const dates: TradingDate[] = [];
    for (
      let date = addDaysToTradingDate(startDate, offset);
      date <= endDate;
      date = addDaysToTradingDate(date, 7)
    ) {
      dates.push(date);
    }
    return dates;
  }

  if (plan.anchor.kind !== "day-of-month") {
    throw new DomainValidationError("매월 플랜의 anchor가 day-of-month가 아니다");
  }
  const anchorDay = plan.anchor.dayOfMonth;
  const start = tradingDateParts(startDate);
  const end = tradingDateParts(endDate);
  const dates: TradingDate[] = [];
  for (
    let year = start.year, month = start.month;
    year < end.year || (year === end.year && month <= end.month);
    month === 12 ? ((year += 1), (month = 1)) : (month += 1)
  ) {
    const day = Math.min(anchorDay, daysInMonth(year, month));
    const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (date >= startDate && date <= endDate) {
      dates.push(date);
    }
  }
  return dates;
}

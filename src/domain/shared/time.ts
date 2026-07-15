import { DomainValidationError } from "./errors";

/** UTC 기준 epoch 밀리초. 정수만 유효하다. */
export type UtcTimestampMs = number;

/**
 * 거래일. `YYYY-MM-DD` 형식의 실제 달력 날짜다.
 *
 * 어느 시간대의 하루인지는 자산의 시장이 정한다. 암호화폐는 UTC 달력일을,
 * 주식은 거래소 시간대의 달력일을 사용하며, 산출은 각 Provider의 책임이다.
 * 문자열 사전순 비교가 시간순 비교와 일치한다.
 */
export type TradingDate = string;

const TRADING_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isUtcTimestampMs(value: number): value is UtcTimestampMs {
  return Number.isSafeInteger(value);
}

export function isTradingDate(value: string): value is TradingDate {
  const match = TRADING_DATE_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function assertTradingDate(value: string, label = "tradingDate"): void {
  if (!isTradingDate(value)) {
    throw new DomainValidationError(
      `${label}이(가) 유효한 거래일(YYYY-MM-DD)이 아니다: "${value}"`,
    );
  }
}

/** UTC epoch 밀리초가 속한 UTC 달력일을 반환한다. 암호화폐 일봉의 거래일 규칙이다. */
export function utcTradingDateFromUtcMs(utcMs: UtcTimestampMs): TradingDate {
  if (!isUtcTimestampMs(utcMs)) {
    throw new DomainValidationError(`유효한 UTC 밀리초 타임스탬프가 아니다: ${utcMs}`);
  }
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** a < b이면 -1, 같으면 0, a > b이면 1. 사전순 비교가 곧 시간순이다. */
export function compareTradingDates(a: TradingDate, b: TradingDate): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** 거래일의 (연, 월, 일) 분해. 유효성 검증 포함. */
export function tradingDateParts(date: TradingDate): {
  year: number;
  month: number;
  day: number;
} {
  assertTradingDate(date);
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

/** ISO 요일. 1=월요일 … 7=일요일. */
export function isoDayOfWeek(date: TradingDate): number {
  const { year, month, day } = tradingDateParts(date);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=일
  return utcDay === 0 ? 7 : utcDay;
}

/** 달력일 기준 n일 이동. 결정론적 UTC 산술만 사용한다. */
export function addDaysToTradingDate(date: TradingDate, days: number): TradingDate {
  const { year, month, day } = tradingDateParts(date);
  if (!Number.isSafeInteger(days)) {
    throw new DomainValidationError(`이동 일수가 정수가 아니다: ${days}`);
  }
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

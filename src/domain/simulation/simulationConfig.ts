import { isDecimalString, parseDecimal, type DecimalString } from "../shared/decimal";
import { DomainValidationError } from "../shared/errors";
import type { Money } from "../shared/money";

/**
 * 정기매수 기준일. (docs/02 §5)
 * - day-of-week: ISO 요일(1=월 … 7=일). 매주 해당 요일이 예정일이다.
 * - day-of-month: 1~31. 해당 월에 그 날짜가 없으면 말일로 당긴다(클램프).
 */
export type RecurringAnchor =
  | { readonly kind: "day-of-week"; readonly isoDayOfWeek: number }
  | { readonly kind: "day-of-month"; readonly dayOfMonth: number };

export type RecurringFrequency = "weekly" | "monthly";

export interface RecurringPlan {
  readonly amount: Money;
  readonly frequency: RecurringFrequency;
  readonly anchor: RecurringAnchor;
}

/** 투자 시뮬레이션 설정. (docs/02 §5, docs/05 §2) */
export interface SimulationConfig {
  readonly mode: "lump-sum" | "dca";
  readonly initialCash: Money;
  readonly recurring?: RecurringPlan;
  /** MVP는 종가 체결만 지원한다 */
  readonly executionPrice: "close";
  /** 거래 금액 대비 수수료율. 0.001 = 0.1% */
  readonly feeRate: DecimalString;
  readonly allowFractionalQuantity: boolean;
  readonly dividendPolicy: "adjusted-price" | "ignore";
}

function assertNonNegativeAmount(label: string, value: DecimalString): void {
  if (!isDecimalString(value)) {
    throw new DomainValidationError(`${label}이(가) 유효한 10진 문자열이 아니다: "${value}"`);
  }
  if (parseDecimal(value).isNegative()) {
    throw new DomainValidationError(`${label}은(는) 음수일 수 없다: ${value}`);
  }
}

/**
 * 설정 불변조건 검증. 위반 시 DomainValidationError(사용자 입력 오류)를 던진다.
 * 음수 금액·수수료를 거부한다 (docs/05 §9).
 */
export function validateSimulationConfig(config: SimulationConfig): void {
  assertNonNegativeAmount("initialCash", config.initialCash.amount);
  assertNonNegativeAmount("feeRate", config.feeRate);

  if (config.executionPrice !== "close") {
    throw new DomainValidationError(`지원하지 않는 체결 가격 기준이다: ${config.executionPrice}`);
  }

  if (config.mode === "lump-sum") {
    if (config.recurring !== undefined) {
      throw new DomainValidationError("일시투자 모드에는 recurring 설정을 둘 수 없다");
    }
    // 0원 일시투자는 유효하다 — 거래 없이 0 스냅샷을 만든다 (docs/05 §9 "0원 원금")
    return;
  }

  const recurring = config.recurring;
  if (recurring === undefined) {
    throw new DomainValidationError("정기매수 모드에는 recurring 설정이 필요하다");
  }
  assertNonNegativeAmount("recurring.amount", recurring.amount.amount);
  if (parseDecimal(recurring.amount.amount).isZero()) {
    throw new DomainValidationError("정기매수 금액은 0보다 커야 한다");
  }
  if (recurring.amount.currency !== config.initialCash.currency) {
    throw new DomainValidationError(
      `정기매수 통화(${recurring.amount.currency})가 초기 자금 통화(${config.initialCash.currency})와 다르다`,
    );
  }

  const anchor = recurring.anchor;
  if (recurring.frequency === "weekly") {
    if (anchor.kind !== "day-of-week") {
      throw new DomainValidationError("매주 정기매수에는 day-of-week 기준일이 필요하다");
    }
    if (
      !Number.isInteger(anchor.isoDayOfWeek) ||
      anchor.isoDayOfWeek < 1 ||
      anchor.isoDayOfWeek > 7
    ) {
      throw new DomainValidationError(`유효한 ISO 요일(1~7)이 아니다: ${anchor.isoDayOfWeek}`);
    }
  } else {
    if (anchor.kind !== "day-of-month") {
      throw new DomainValidationError("매월 정기매수에는 day-of-month 기준일이 필요하다");
    }
    if (!Number.isInteger(anchor.dayOfMonth) || anchor.dayOfMonth < 1 || anchor.dayOfMonth > 31) {
      throw new DomainValidationError(`유효한 일(1~31)이 아니다: ${anchor.dayOfMonth}`);
    }
  }
}

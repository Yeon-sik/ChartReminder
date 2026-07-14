import { assertCurrencyCode, type CurrencyCode } from "./currency";
import { assertDecimalString, parseDecimal, toDecimalString, type DecimalString } from "./decimal";
import { DomainValidationError } from "./errors";

/**
 * 통화가 명시된 금액 값 객체. 손익 표현을 위해 음수를 허용한다.
 * 서로 다른 통화 간 연산은 도메인 오류다. (OQ-006: 교차 통화 비교는 별도 게이트)
 */
export interface Money {
  readonly amount: DecimalString;
  readonly currency: CurrencyCode;
}

export function createMoney(amount: string, currency: string): Money {
  assertDecimalString(amount, "amount");
  assertCurrencyCode(currency);
  return { amount, currency };
}

export function zeroMoney(currency: CurrencyCode): Money {
  return createMoney("0", currency);
}

function assertSameCurrency(a: Money, b: Money, operation: string): void {
  if (a.currency !== b.currency) {
    throw new DomainValidationError(
      `서로 다른 통화는 ${operation}할 수 없다: ${a.currency} vs ${b.currency}`,
    );
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b, "더하기");
  return {
    amount: toDecimalString(parseDecimal(a.amount).plus(parseDecimal(b.amount))),
    currency: a.currency,
  };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b, "빼기");
  return {
    amount: toDecimalString(parseDecimal(a.amount).minus(parseDecimal(b.amount))),
    currency: a.currency,
  };
}

/** a < b이면 -1, 같으면 0, a > b이면 1을 반환한다. */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b, "비교");
  const comparison = parseDecimal(a.amount).comparedTo(parseDecimal(b.amount));
  if (comparison < 0) return -1;
  if (comparison > 0) return 1;
  return 0;
}

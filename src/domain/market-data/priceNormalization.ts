import {
  DomainDecimal,
  parseDecimal,
  toDecimalString,
  type DecimalString,
} from "../shared/decimal";
import { DomainValidationError } from "../shared/errors";

const HUNDRED = new DomainDecimal(100);

/**
 * 가격 배열을 첫 값 기준 100으로 정규화한다. (docs/06 §4 기본 표시 기준)
 *
 * 호출측은 관측 없는(pre-listing) 구간을 미리 걸러낸 가격만 전달해야 한다 —
 * 이 함수는 null을 다루지 않는다. 빈 배열은 빈 배열을 반환한다.
 */
export function normalizeToBase100(prices: readonly DecimalString[]): DecimalString[] {
  if (prices.length === 0) {
    return [];
  }
  const base = parseDecimal(prices[0]);
  if (base.lessThanOrEqualTo(0)) {
    throw new DomainValidationError(`정규화 기준 가격은 0보다 커야 한다: ${prices[0]}`);
  }
  return prices.map((price) => toDecimalString(parseDecimal(price).dividedBy(base).times(HUNDRED)));
}

/**
 * 첫 값 대비 누적 수익률(소수, 0.1 = 10%)을 계산한다. (docs/06 §4)
 *
 * 표시(%) 변환은 UI 포맷 단계의 책임이다.
 */
export function cumulativeReturnRate(prices: readonly DecimalString[]): DecimalString[] {
  if (prices.length === 0) {
    return [];
  }
  const base = parseDecimal(prices[0]);
  if (base.lessThanOrEqualTo(0)) {
    throw new DomainValidationError(`누적 수익률 기준 가격은 0보다 커야 한다: ${prices[0]}`);
  }
  return prices.map((price) => toDecimalString(parseDecimal(price).minus(base).dividedBy(base)));
}

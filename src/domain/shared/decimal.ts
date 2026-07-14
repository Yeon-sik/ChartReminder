import { Decimal } from "decimal.js";

import { DomainValidationError } from "./errors";

/**
 * 도메인 경계에서 사용하는 직렬화 가능한 10진 문자열. (docs/02_DOMAIN_MODEL.md §3)
 *
 * 정규 형식만 허용한다: 선택적 음수 부호, 선행 0 없는 정수부, 선택적 소수부.
 * 지수 표기(`1e5`), `+` 부호, `.5`/`5.` 같은 축약, `NaN`/`Infinity`는 허용하지 않는다.
 */
export type DecimalString = string;

const DECIMAL_STRING_PATTERN = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/**
 * 도메인 계산 전용 Decimal 생성자. (D-005, D-009)
 *
 * `Decimal.clone`으로 전역 설정과 분리한다.
 * precision 34(IEEE 754 decimal128 수준)와 ROUND_HALF_UP은 나눗셈 등
 * 무한소수가 생기는 중간 연산의 기본값이다. 시뮬레이션 결과의 반올림 정책은
 * M4에서 연산별로 명시적으로 정의한다.
 */
export const DomainDecimal = Decimal.clone({
  precision: 34,
  rounding: Decimal.ROUND_HALF_UP,
});

export function isDecimalString(value: string): value is DecimalString {
  return DECIMAL_STRING_PATTERN.test(value);
}

export function assertDecimalString(value: string, label = "value"): void {
  if (!isDecimalString(value)) {
    throw new DomainValidationError(`${label}이(가) 정규 10진 문자열이 아니다: "${value}"`);
  }
}

/** 검증된 DecimalString을 도메인 Decimal 값으로 파싱한다. */
export function parseDecimal(value: DecimalString): Decimal {
  assertDecimalString(value);
  return new DomainDecimal(value);
}

/** Decimal 값을 정규 DecimalString으로 직렬화한다. 유한하지 않은 값은 거부한다. */
export function toDecimalString(value: Decimal): DecimalString {
  if (!value.isFinite()) {
    throw new DomainValidationError(
      `유한하지 않은 Decimal은 직렬화할 수 없다: ${value.toString()}`,
    );
  }
  const fixed = value.toFixed();
  return fixed === "-0" ? "0" : fixed;
}

/** 소수 dp자리 ROUND_HALF_UP 반올림. 비율 표기 등 명시적 반올림 지점에서 사용한다. */
export function roundHalfUp(value: Decimal, decimalPlaces: number): Decimal {
  return value.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

/**
 * 차트 렌더링 경계 전용 number 변환. (docs/02 §3)
 *
 * 유한성을 검사하며, double 정밀도로의 손실은 이 경계에서만 허용된다.
 * 도메인 계산에 이 함수의 결과를 되돌려 사용하지 않는다.
 */
export function toChartNumber(value: DecimalString): number {
  assertDecimalString(value);
  const converted = Number(value);
  if (!Number.isFinite(converted)) {
    throw new DomainValidationError(`차트 number 범위를 벗어난 값이다: "${value}"`);
  }
  return converted;
}

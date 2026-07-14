import { DomainValidationError } from "./errors";

/**
 * 통화 코드. ISO 4217(`USD`, `KRW`)과 거래쌍 quote 자산(`USDT`)을 모두 표현한다.
 * 대문자 영숫자 2~10자만 허용한다.
 */
export type CurrencyCode = string;

const CURRENCY_CODE_PATTERN = /^[A-Z0-9]{2,10}$/;

export function isCurrencyCode(value: string): value is CurrencyCode {
  return CURRENCY_CODE_PATTERN.test(value);
}

export function assertCurrencyCode(value: string): void {
  if (!isCurrencyCode(value)) {
    throw new DomainValidationError(`유효한 통화 코드가 아니다: "${value}"`);
  }
}

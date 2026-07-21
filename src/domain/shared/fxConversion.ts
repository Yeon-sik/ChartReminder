import type { CurrencyCode } from "./currency";
import { parseDecimal, toDecimalString, type DecimalString } from "./decimal";
import { DomainValidationError } from "./errors";
import type { Money } from "./money";
import { isUtcTimestampMs, type UtcTimestampMs } from "./time";

/**
 * 사용자가 선택하는 표시/입력 통화. (OQ-006 RESOLVED, D-020)
 *
 * 시뮬레이션 엔진·캔들 캐시는 항상 각 자산 고유 통화(quoteCurrency)를 그대로 쓴다 —
 * 이 타입은 화면 표시·투자 금액 입력 "경계"에서만 쓰이는 사용자 선호 통화다.
 */
export type DisplayCurrency = "KRW" | "USD";

/**
 * USD/KRW 환율(1 USD당 KRW). Frankfurter 등 실제 공급자가 채우는 최소 계약.
 */
export interface UsdKrwRate {
  readonly krwPerUsd: DecimalString;
  readonly asOfUtcMs: UtcTimestampMs;
}

/**
 * USD와 1:1로 간주하는 통화 집합. (D-020 — 사용자가 명시한 가정)
 *
 * USDT(Binance 크립토 거래쌍의 quote 자산)는 실제로는 스테이블코인 시장가가 있지만,
 * 이 앱은 비교 목적의 표시/입력 변환에서만 정확히 1 USDT = 1 USD로 취급한다. 시뮬레이션
 * 계산 자체(Money.currency="USDT")는 건드리지 않는다 — 변환 경계에서만 적용되는 가정이다.
 */
const USD_PEGGED_CURRENCIES: ReadonlySet<CurrencyCode> = new Set(["USD", "USDT"]);

function isUsdPegged(currency: CurrencyCode): boolean {
  return USD_PEGGED_CURRENCIES.has(currency);
}

function assertSupportedCurrency(currency: CurrencyCode): void {
  if (currency !== "KRW" && !isUsdPegged(currency)) {
    throw new DomainValidationError(
      `환율 변환이 지원하지 않는 통화다: "${currency}" (KRW, USD, USDT만 지원)`,
    );
  }
}

function assertValidRate(rate: UsdKrwRate): void {
  if (!isUtcTimestampMs(rate.asOfUtcMs)) {
    throw new DomainValidationError(
      `환율 asOfUtcMs가 유효한 타임스탬프가 아니다: ${rate.asOfUtcMs}`,
    );
  }
  const parsed = parseDecimal(rate.krwPerUsd);
  if (!parsed.greaterThan(0)) {
    throw new DomainValidationError(`환율(krwPerUsd)은 양수여야 한다: ${rate.krwPerUsd}`);
  }
}

/**
 * 금액을 한 통화에서 다른 통화로 환산한다. (D-020)
 *
 * KRW · USD · USDT 세 통화만 지원하며 양방향으로 쓴다 — 결과 화면 표시(자산 고유 통화 →
 * 사용자가 고른 표시 통화)와 통합 투자 금액 입력(표시 통화 → 자산 고유 통화) 모두 이
 * 함수 하나로 처리한다.
 *
 * - 같은 통화면 그대로 반환한다.
 * - 같은 통화군(USD·USDT끼리)이면 환율 없이 1:1로 취급한다(위 가정).
 * - KRW ↔ USD-pegged 사이만 실제 환산이 필요하고, 그때 `rate`가 없으면
 *   `DomainValidationError`로 실패한다(조용히 잘못된 값을 반환하지 않는다).
 */
export function convertAmount(
  amount: DecimalString,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  rate: UsdKrwRate | null,
): DecimalString {
  assertSupportedCurrency(fromCurrency);
  assertSupportedCurrency(toCurrency);

  if (fromCurrency === toCurrency) {
    return amount;
  }
  if (isUsdPegged(fromCurrency) && isUsdPegged(toCurrency)) {
    return amount; // USD ↔ USDT, 1:1 가정
  }
  if (rate === null) {
    throw new DomainValidationError(
      `환율 정보를 불러오지 못해 ${fromCurrency} → ${toCurrency} 환산을 할 수 없습니다`,
    );
  }
  assertValidRate(rate);

  if (fromCurrency === "KRW") {
    // KRW → USD-pegged
    return toDecimalString(parseDecimal(amount).dividedBy(parseDecimal(rate.krwPerUsd)));
  }
  // USD-pegged → KRW
  return toDecimalString(parseDecimal(amount).times(parseDecimal(rate.krwPerUsd)));
}

/** `convertAmount`의 Money 래퍼. 결과 `currency`는 항상 `toCurrency`다("USD" 표시 시 USDT도 "USD"로 라벨링). */
export function convertMoney(
  money: Money,
  toCurrency: DisplayCurrency,
  rate: UsdKrwRate | null,
): Money {
  return {
    amount: convertAmount(money.amount, money.currency, toCurrency, rate),
    currency: toCurrency,
  };
}

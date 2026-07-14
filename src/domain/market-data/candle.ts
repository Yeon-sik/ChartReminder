import { isCurrencyCode, type CurrencyCode } from "../shared/currency";
import { isDecimalString, parseDecimal, type DecimalString } from "../shared/decimal";
import { DomainValidationError } from "../shared/errors";
import {
  isTradingDate,
  isUtcTimestampMs,
  type TradingDate,
  type UtcTimestampMs,
} from "../shared/time";

/** MVP는 일봉만 지원한다. */
export type CandleInterval = "1d";

export type PriceBasis = "raw" | "adjusted";

/** 데이터 출처 추적. (docs/02_DOMAIN_MODEL.md §7) */
export interface DataSourceRef {
  readonly providerId: string;
  readonly providerSymbol: string;
  readonly fetchedAtUtcMs: UtcTimestampMs;
  readonly priceBasis: PriceBasis;
  readonly dataVersion?: string;
}

/** 정규화된 일봉 캔들. (docs/02_DOMAIN_MODEL.md §2) */
export interface Candle {
  readonly instrumentId: string;
  readonly interval: CandleInterval;
  readonly openTimeUtcMs: UtcTimestampMs;
  readonly closeTimeUtcMs: UtcTimestampMs;
  readonly tradingDate: TradingDate;
  readonly open: DecimalString;
  readonly high: DecimalString;
  readonly low: DecimalString;
  readonly close: DecimalString;
  readonly adjustedClose?: DecimalString;
  readonly volume?: DecimalString;
  readonly quoteCurrency: CurrencyCode;
  readonly source: DataSourceRef;
}

export interface CandleInvariantIssue {
  readonly code:
    | "invalid-instrument-id"
    | "invalid-open-time"
    | "invalid-close-time"
    | "time-not-ascending"
    | "invalid-trading-date"
    | "unparseable-price"
    | "high-below-body"
    | "low-above-body"
    | "invalid-adjusted-close"
    | "invalid-volume"
    | "negative-volume"
    | "invalid-currency"
    | "invalid-source";
  readonly message: string;
}

/**
 * 캔들 불변조건을 검증하고 위반 목록을 반환한다. 빈 배열이면 유효하다.
 * (docs/02_DOMAIN_MODEL.md §2 불변조건)
 *
 * 음수 가격은 도메인 전체에서 금지하지 않는다. Provider별 정책으로 검증한다.
 */
export function validateCandle(candle: Candle): CandleInvariantIssue[] {
  const issues: CandleInvariantIssue[] = [];

  if (candle.instrumentId.trim() === "") {
    issues.push({ code: "invalid-instrument-id", message: "instrumentId가 비어 있다" });
  }
  if (!isUtcTimestampMs(candle.openTimeUtcMs)) {
    issues.push({
      code: "invalid-open-time",
      message: `openTimeUtcMs가 유효한 정수 밀리초가 아니다: ${candle.openTimeUtcMs}`,
    });
  }
  if (!isUtcTimestampMs(candle.closeTimeUtcMs)) {
    issues.push({
      code: "invalid-close-time",
      message: `closeTimeUtcMs가 유효한 정수 밀리초가 아니다: ${candle.closeTimeUtcMs}`,
    });
  } else if (
    isUtcTimestampMs(candle.openTimeUtcMs) &&
    candle.openTimeUtcMs >= candle.closeTimeUtcMs
  ) {
    issues.push({
      code: "time-not-ascending",
      message: `openTimeUtcMs(${candle.openTimeUtcMs}) < closeTimeUtcMs(${candle.closeTimeUtcMs})를 위반한다`,
    });
  }
  if (!isTradingDate(candle.tradingDate)) {
    issues.push({
      code: "invalid-trading-date",
      message: `tradingDate가 유효한 거래일이 아니다: "${candle.tradingDate}"`,
    });
  }

  const prices: readonly (readonly [field: string, value: DecimalString])[] = [
    ["open", candle.open],
    ["high", candle.high],
    ["low", candle.low],
    ["close", candle.close],
  ];
  const unparseable = prices.filter(([, value]) => !isDecimalString(value));
  for (const [field, value] of unparseable) {
    issues.push({
      code: "unparseable-price",
      message: `${field}이(가) 파싱 가능한 10진 문자열이 아니다: "${value}"`,
    });
  }

  if (unparseable.length === 0) {
    const open = parseDecimal(candle.open);
    const high = parseDecimal(candle.high);
    const low = parseDecimal(candle.low);
    const close = parseDecimal(candle.close);
    const bodyHigh = open.greaterThan(close) ? open : close;
    const bodyLow = open.lessThan(close) ? open : close;
    if (high.lessThan(bodyHigh)) {
      issues.push({
        code: "high-below-body",
        message: `high(${candle.high}) >= max(open, close)(${bodyHigh.toFixed()})를 위반한다`,
      });
    }
    if (low.greaterThan(bodyLow)) {
      issues.push({
        code: "low-above-body",
        message: `low(${candle.low}) <= min(open, close)(${bodyLow.toFixed()})를 위반한다`,
      });
    }
  }

  if (candle.adjustedClose !== undefined && !isDecimalString(candle.adjustedClose)) {
    issues.push({
      code: "invalid-adjusted-close",
      message: `adjustedClose가 파싱 가능한 10진 문자열이 아니다: "${candle.adjustedClose}"`,
    });
  }
  if (candle.volume !== undefined) {
    if (!isDecimalString(candle.volume)) {
      issues.push({
        code: "invalid-volume",
        message: `volume이 파싱 가능한 10진 문자열이 아니다: "${candle.volume}"`,
      });
    } else if (parseDecimal(candle.volume).isNegative()) {
      issues.push({
        code: "negative-volume",
        message: `volume은 음수일 수 없다: ${candle.volume}`,
      });
    }
  }
  if (!isCurrencyCode(candle.quoteCurrency)) {
    issues.push({
      code: "invalid-currency",
      message: `quoteCurrency가 유효한 통화 코드가 아니다: "${candle.quoteCurrency}"`,
    });
  }
  if (candle.source.providerId.trim() === "" || !isUtcTimestampMs(candle.source.fetchedAtUtcMs)) {
    issues.push({
      code: "invalid-source",
      message: "source의 providerId 또는 fetchedAtUtcMs가 유효하지 않다",
    });
  }

  return issues;
}

/** 불변조건 위반이 있으면 DomainValidationError를 던진다. */
export function assertValidCandle(candle: Candle): void {
  const issues = validateCandle(candle);
  if (issues.length > 0) {
    throw new DomainValidationError(
      `캔들 불변조건 위반 (${candle.instrumentId} ${candle.tradingDate})`,
      issues.map((issue) => `${issue.code}: ${issue.message}`),
    );
  }
}

/** 중복 판정 키: (instrumentId, interval, openTimeUtcMs, source.providerId). */
export function candleDuplicateKey(candle: Candle): string {
  return [
    candle.instrumentId,
    candle.interval,
    candle.openTimeUtcMs,
    candle.source.providerId,
  ].join("|");
}

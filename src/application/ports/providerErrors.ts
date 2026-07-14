/**
 * 공급자 오류 분류. (docs/03 §3)
 *
 * Rate limit은 일반 네트워크 오류와 구분하고, 부분 성공을 전체 성공으로 위장하지 않는다.
 * 사용자 오류(잘못된 요청)와 시스템 오류(네트워크·공급자 장애)를 나누는 기준이 된다.
 */
export type ProviderErrorKind = "network" | "rate-limit" | "invalid-response" | "provider";

export class MarketDataProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly providerId: string;
  /** 원인 오류 보존 (tsconfig lib이 ES2020이라 Error cause 옵션 대신 직접 보관) */
  readonly causedBy?: unknown;

  constructor(kind: ProviderErrorKind, providerId: string, message: string, causedBy?: unknown) {
    super(message);
    this.name = "MarketDataProviderError";
    this.kind = kind;
    this.providerId = providerId;
    this.causedBy = causedBy;
  }
}

export class ProviderNetworkError extends MarketDataProviderError {
  constructor(providerId: string, message: string, cause?: unknown) {
    super("network", providerId, message, cause);
    this.name = "ProviderNetworkError";
  }
}

export class ProviderRateLimitError extends MarketDataProviderError {
  /** Retry-After 헤더 기반 대기 시간. 없으면 undefined. */
  readonly retryAfterMs?: number;
  /** HTTP 418: IP ban 상태. 재시도하면 안 된다. */
  readonly banned: boolean;

  constructor(providerId: string, message: string, retryAfterMs?: number, banned = false) {
    super("rate-limit", providerId, message);
    this.name = "ProviderRateLimitError";
    this.retryAfterMs = retryAfterMs;
    this.banned = banned;
  }
}

export class ProviderResponseError extends MarketDataProviderError {
  readonly issues: readonly string[];

  constructor(providerId: string, message: string, issues: readonly string[] = []) {
    super(
      "invalid-response",
      providerId,
      issues.length > 0 ? `${message}: ${issues.join("; ")}` : message,
    );
    this.name = "ProviderResponseError";
    this.issues = issues;
  }
}

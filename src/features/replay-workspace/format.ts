import { parseDecimal, roundHalfUp, type DecimalString } from "../../domain/shared/decimal";
import { DomainValidationError } from "../../domain/shared/errors";
import type { Money } from "../../domain/shared/money";
import {
  MarketDataProviderError,
  ProviderAuthError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderResponseError,
} from "../../application/ports/providerErrors";
import type { AssetDataNotice } from "../../application/use-cases/prepareReplaySession";

/** 통화 표시용 2자리 고정 반올림. 도메인 계산의 정밀 표기(RATE_DECIMAL_PLACES 등)와는 별개다. */
export function formatMoney(money: Money): string {
  const rounded = roundHalfUp(parseDecimal(money.amount), 2);
  return `${rounded.toFixed(2)} ${money.currency}`;
}

/** 소수 비율을 퍼센트 문자열로 표시한다 (0.1818… → "18.18%"). */
export function formatPercent(rate: DecimalString): string {
  const percent = roundHalfUp(parseDecimal(rate).times(100), 2);
  return `${percent.toFixed(2)}%`;
}

export function formatPriceStatus(status: "fresh" | "carried-forward"): string {
  return status === "fresh" ? "실시간 종가" : "이월된 마지막 종가(carried-forward)";
}

/**
 * docs/00 §"필수 화면 상태"의 데이터 경고 문구. 재현 가능한 것만 매핑한다.
 * 우선순위: 완전 없음 > 상장 이전 > 중간 누락.
 */
export function formatDataNotice(notice: AssetDataNotice): string | null {
  if (notice.hasNoData) {
    return "요청한 기간에 데이터가 없습니다.";
  }
  if (notice.hasPreListingGap) {
    return "선택한 기간의 앞부분은 상장 이전이라 데이터가 없습니다.";
  }
  if (notice.hasInteriorGap) {
    return "일부 구간의 데이터가 없어 마지막 종가로 이월해 표시합니다.";
  }
  return null;
}

/**
 * Provider·도메인 오류를 사용자 문구로 변환한다. (docs/06 §6)
 *
 * "캐시 손상"은 현재 재현할 수 없어 매핑하지 않는다 (PROJECT_STATE 남은 위험에 기록).
 * "라이선스 또는 인증 설정 필요"는 BYOK Provider(Tiingo 등)의 `ProviderAuthError`로
 * 재현된다 (D-015). 기술 스택 트레이스는 노출하지 않는다.
 */
export function formatProviderError(error: unknown): string {
  if (error instanceof ProviderAuthError) {
    return `라이선스 또는 인증 설정이 필요합니다: ${error.message}`;
  }
  if (error instanceof ProviderRateLimitError) {
    return error.banned
      ? "요청이 일시적으로 차단되었습니다(공급자 rate limit). 잠시 후 다시 시도해 주세요."
      : "요청이 너무 많습니다(공급자 rate limit). 잠시 후 다시 시도해 주세요.";
  }
  if (error instanceof ProviderNetworkError) {
    return "인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
  }
  if (error instanceof ProviderResponseError) {
    return "공급자 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (error instanceof MarketDataProviderError) {
    return "요청이 거부되었습니다. 자산 또는 기간 설정을 확인해 주세요.";
  }
  if (error instanceof DomainValidationError) {
    return error.message;
  }
  return "예상치 못한 오류가 발생했습니다. 다시 시도해 주세요.";
}

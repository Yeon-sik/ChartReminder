import type { UsdKrwRate } from "../../domain/shared/fxConversion";

/**
 * 현재 USD/KRW 환율 조회 포트. (OQ-006 RESOLVED, D-020)
 *
 * 표시/입력 통화 변환에만 쓰인다 — 시뮬레이션 엔진·캔들 캐시는 이 포트를 모른다.
 */
export interface FxRateProvider {
  /** `forceRefresh`가 없으면 구현체 내부 캐시를 우선 쓸 수 있다. */
  getUsdKrwRate(options?: { readonly forceRefresh?: boolean }): Promise<UsdKrwRate>;
}

/**
 * FX 조회 오류 분류. (docs/03 §3과 같은 원칙 — 사용자 오류와 시스템 오류를 구분한다)
 *
 * "network"는 연결 실패·5xx 등 재시도하면 나아질 수 있는 시스템 오류,
 * "invalid-response"는 응답 스키마가 예상과 달라 재시도로 해결되지 않는 오류다.
 */
export type FxRateErrorKind = "network" | "invalid-response";

export class FxRateError extends Error {
  readonly kind: FxRateErrorKind;

  constructor(kind: FxRateErrorKind, message: string) {
    super(message);
    this.name = "FxRateError";
    this.kind = kind;
  }
}

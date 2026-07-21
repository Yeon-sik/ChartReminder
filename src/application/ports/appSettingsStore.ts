import type { DisplayCurrency } from "../../domain/shared/fxConversion";

/**
 * 앱 수준 사용자 설정 저장 포트. (D-020)
 *
 * BYOK 비밀정보를 다루는 `ApiKeyStore`와 달리 민감정보가 아닌 UI 선호값(표시 통화 등)을
 * 저장한다 — 책임 경계를 분리해 두 포트를 섞어 쓰지 않는다.
 */
export interface AppSettingsStore {
  /** 저장된 값이 없으면 "KRW"를 기본값으로 반환한다. */
  getDisplayCurrency(): Promise<DisplayCurrency>;
  setDisplayCurrency(value: DisplayCurrency): Promise<void>;
}

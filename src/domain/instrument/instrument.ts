import type { CurrencyCode } from "../shared/currency";

export type AssetClass = "crypto" | "stock";

export type InstrumentStatus = "active" | "inactive" | "unknown";

/**
 * 가격 시계열의 비교 대상. (docs/02_DOMAIN_MODEL.md §1)
 *
 * `id`는 공급자 변경에도 가능한 한 안정적으로 유지되는 내부 식별자다.
 * 공급자 종속 정보(providerId, providerSymbol)는 매핑을 위해 함께 보존한다.
 */
export interface Instrument {
  readonly id: string;
  readonly symbol: string;
  readonly displayName: string;
  readonly assetClass: AssetClass;
  readonly market: string;
  readonly quoteCurrency: CurrencyCode;
  readonly exchangeTimezone: string;
  readonly providerId: string;
  readonly providerSymbol: string;
  readonly status: InstrumentStatus;
}

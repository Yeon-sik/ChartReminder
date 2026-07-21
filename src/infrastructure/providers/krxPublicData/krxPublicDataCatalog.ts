import type { Instrument } from "../../../domain/instrument/instrument";

export const KRX_PUBLIC_DATA_PROVIDER_ID = "krx-public-data";

/**
 * MVP-C 지원 자산 카탈로그. (D-017)
 *
 * 전체 KRX 상장 종목이 아니라 대형주 위주의 소규모 큐레이션이다 — M7의 Tiingo와 동일한 범위
 * 원칙(전체 종목 검색 UI는 범위 밖). `id`는 공급자 교체에도 유지되는 내부 식별자다.
 * `providerSymbol`은 KRX 단축코드(6자리)다. (docs/02 §1)
 */
export const KRX_PUBLIC_DATA_INSTRUMENTS: readonly Instrument[] = [
  {
    id: "stock-005930",
    symbol: "005930",
    displayName: "삼성전자",
    assetClass: "stock",
    market: "KRX",
    quoteCurrency: "KRW",
    exchangeTimezone: "Asia/Seoul",
    providerId: KRX_PUBLIC_DATA_PROVIDER_ID,
    providerSymbol: "005930",
    status: "active",
  },
  {
    id: "stock-000660",
    symbol: "000660",
    displayName: "SK하이닉스",
    assetClass: "stock",
    market: "KRX",
    quoteCurrency: "KRW",
    exchangeTimezone: "Asia/Seoul",
    providerId: KRX_PUBLIC_DATA_PROVIDER_ID,
    providerSymbol: "000660",
    status: "active",
  },
  {
    id: "stock-035420",
    symbol: "035420",
    displayName: "NAVER",
    assetClass: "stock",
    market: "KRX",
    quoteCurrency: "KRW",
    exchangeTimezone: "Asia/Seoul",
    providerId: KRX_PUBLIC_DATA_PROVIDER_ID,
    providerSymbol: "035420",
    status: "active",
  },
  {
    id: "stock-035720",
    symbol: "035720",
    displayName: "카카오",
    assetClass: "stock",
    market: "KRX",
    quoteCurrency: "KRW",
    exchangeTimezone: "Asia/Seoul",
    providerId: KRX_PUBLIC_DATA_PROVIDER_ID,
    providerSymbol: "035720",
    status: "active",
  },
  {
    id: "stock-005380",
    symbol: "005380",
    displayName: "현대차",
    assetClass: "stock",
    market: "KRX",
    quoteCurrency: "KRW",
    exchangeTimezone: "Asia/Seoul",
    providerId: KRX_PUBLIC_DATA_PROVIDER_ID,
    providerSymbol: "005380",
    status: "active",
  },
];

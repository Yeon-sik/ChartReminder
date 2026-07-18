import type { Instrument } from "../../../domain/instrument/instrument";

export const TIINGO_PROVIDER_ID = "tiingo";

/**
 * MVP-B 지원 자산 카탈로그. (D-015)
 *
 * 전체 Tiingo 종목이 아니라 대형주 위주의 소규모 큐레이션이다 — 수천 개 종목을 검색하는
 * UI는 M7 범위 밖이다(계획서 참조). `id`는 공급자 교체에도 유지되는 내부 식별자다.
 * (docs/02 §1)
 */
export const TIINGO_INSTRUMENTS: readonly Instrument[] = [
  {
    id: "stock-aapl",
    symbol: "AAPL",
    displayName: "Apple Inc.",
    assetClass: "stock",
    market: "NASDAQ",
    quoteCurrency: "USD",
    exchangeTimezone: "America/New_York",
    providerId: TIINGO_PROVIDER_ID,
    providerSymbol: "aapl",
    status: "active",
  },
  {
    id: "stock-msft",
    symbol: "MSFT",
    displayName: "Microsoft Corporation",
    assetClass: "stock",
    market: "NASDAQ",
    quoteCurrency: "USD",
    exchangeTimezone: "America/New_York",
    providerId: TIINGO_PROVIDER_ID,
    providerSymbol: "msft",
    status: "active",
  },
  {
    id: "stock-googl",
    symbol: "GOOGL",
    displayName: "Alphabet Inc. (Class A)",
    assetClass: "stock",
    market: "NASDAQ",
    quoteCurrency: "USD",
    exchangeTimezone: "America/New_York",
    providerId: TIINGO_PROVIDER_ID,
    providerSymbol: "googl",
    status: "active",
  },
  {
    id: "stock-amzn",
    symbol: "AMZN",
    displayName: "Amazon.com, Inc.",
    assetClass: "stock",
    market: "NASDAQ",
    quoteCurrency: "USD",
    exchangeTimezone: "America/New_York",
    providerId: TIINGO_PROVIDER_ID,
    providerSymbol: "amzn",
    status: "active",
  },
  {
    id: "stock-nvda",
    symbol: "NVDA",
    displayName: "NVIDIA Corporation",
    assetClass: "stock",
    market: "NASDAQ",
    quoteCurrency: "USD",
    exchangeTimezone: "America/New_York",
    providerId: TIINGO_PROVIDER_ID,
    providerSymbol: "nvda",
    status: "active",
  },
];

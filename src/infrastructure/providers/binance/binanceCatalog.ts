import type { Instrument } from "../../../domain/instrument/instrument";

export const BINANCE_PROVIDER_ID = "binance";

/**
 * MVP-A 지원 자산 카탈로그. (D-002, D-010)
 *
 * 가격은 Binance 현물 USDT 시장 기준이다. UI는 거래쌍과 출처를 함께 표시해야 한다.
 * `id`는 공급자 교체에도 유지되는 내부 식별자다. (docs/02 §1)
 */
export const BINANCE_INSTRUMENTS: readonly Instrument[] = [
  {
    id: "crypto-btc-usdt",
    symbol: "BTC/USDT",
    displayName: "Bitcoin",
    assetClass: "crypto",
    market: "BINANCE",
    quoteCurrency: "USDT",
    exchangeTimezone: "UTC",
    providerId: BINANCE_PROVIDER_ID,
    providerSymbol: "BTCUSDT",
    status: "active",
  },
  {
    id: "crypto-eth-usdt",
    symbol: "ETH/USDT",
    displayName: "Ethereum",
    assetClass: "crypto",
    market: "BINANCE",
    quoteCurrency: "USDT",
    exchangeTimezone: "UTC",
    providerId: BINANCE_PROVIDER_ID,
    providerSymbol: "ETHUSDT",
    status: "active",
  },
  {
    id: "crypto-sol-usdt",
    symbol: "SOL/USDT",
    displayName: "Solana",
    assetClass: "crypto",
    market: "BINANCE",
    quoteCurrency: "USDT",
    exchangeTimezone: "UTC",
    providerId: BINANCE_PROVIDER_ID,
    providerSymbol: "SOLUSDT",
    status: "active",
  },
];

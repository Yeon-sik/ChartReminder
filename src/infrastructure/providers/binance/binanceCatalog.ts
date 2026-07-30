import type { Instrument } from "../../../domain/instrument/instrument";

export const BINANCE_PROVIDER_ID = "binance";

/**
 * 앱 시작과 "비교 자산 추가"에 사용하는 빠른 기본 추천. (D-002, D-010)
 *
 * 전체 지원 목록은 Binance `exchangeInfo`에서 동적으로 읽는다. 이 배열은 오프라인 기본값과
 * 기존 저장 세션의 안정적인 이름을 유지하기 위한 것이며 전체 카탈로그가 아니다.
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

const PREFERRED_DISPLAY_NAMES = new Map(
  BINANCE_INSTRUMENTS.map((instrument) => [instrument.providerSymbol, instrument.displayName]),
);

/**
 * Binance 거래쌍을 공통 Instrument로 변환한다.
 *
 * 기존 BTC·ETH·SOL ID를 그대로 보존하면서 동적 거래쌍에도 같은 규칙을 적용한다.
 */
export function createBinanceInstrument(
  baseAsset: string,
  quoteAsset: string,
  providerSymbol: string,
): Instrument {
  return {
    id: `crypto-${baseAsset.toLowerCase()}-${quoteAsset.toLowerCase()}`,
    symbol: `${baseAsset}/${quoteAsset}`,
    displayName: PREFERRED_DISPLAY_NAMES.get(providerSymbol) ?? baseAsset,
    assetClass: "crypto",
    market: "BINANCE",
    quoteCurrency: quoteAsset,
    exchangeTimezone: "UTC",
    providerId: BINANCE_PROVIDER_ID,
    providerSymbol,
    status: "active",
  };
}

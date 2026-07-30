import { describe, expect, it } from "vitest";

import { assertValidCandle } from "../../../domain/market-data/candle";
import { fetchHttpClient } from "../../http/httpClient";
import { BINANCE_INSTRUMENTS } from "./binanceCatalog";
import { BinanceProvider } from "./binanceProvider";

/**
 * 실제 Binance API 스모크 테스트. 네트워크에 의존하므로 기본 실행에서 제외한다.
 *
 * 실행: PowerShell에서 `$env:LIVE_API = "1"; npm run test` (docs/providers/BINANCE.md)
 * CI 필수 검증에 포함하지 않는다 (불안정한 네트워크 의존 금지, docs/08).
 */
describe.runIf(process.env.LIVE_API === "1")("BinanceProvider 실제 API 스모크", () => {
  it("공개 exchangeInfo에서 BTC 외 활성 USDT 현물 종목을 탐색한다", async () => {
    const provider = new BinanceProvider({ httpClient: fetchHttpClient });
    const instruments = await provider.searchInstruments("");

    expect(instruments.length).toBeGreaterThan(3);
    expect(instruments.some((instrument) => instrument.providerSymbol === "BTCUSDT")).toBe(true);
    expect(instruments.every((instrument) => instrument.quoteCurrency === "USDT")).toBe(true);
  }, 30_000);

  it("BTC/USDT 최근 닫힌 일봉 5개를 조회·정규화한다", async () => {
    const provider = new BinanceProvider({ httpClient: fetchHttpClient });
    const DAY_MS = 86_400_000;
    const todayStartMs = Math.floor(Date.now() / DAY_MS) * DAY_MS;

    const batch = await provider.getCandles({
      instrument: BINANCE_INSTRUMENTS[0],
      interval: "1d",
      range: { startMs: todayStartMs - 5 * DAY_MS, endMs: todayStartMs },
    });

    expect(batch.candles).toHaveLength(5);
    for (const candle of batch.candles) {
      assertValidCandle(candle);
      expect(candle.quoteCurrency).toBe("USDT");
      expect(candle.source.providerId).toBe("binance");
    }
  }, 30_000);
});

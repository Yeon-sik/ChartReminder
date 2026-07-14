import type { Instrument } from "../instrument/instrument";
import type { Candle } from "../market-data/candle";
import type { DecimalString } from "../shared/decimal";
import type { TradingDate } from "../shared/time";

/**
 * Golden Fixture: 사람이 손으로 검산할 수 있는 5일 고정 데이터셋.
 * (docs/08_TEST_STRATEGY.md §2, docs/16_GOLDEN_FIXTURES.md)
 *
 * 종가 경로 100 → 110 → 90 → 120 → 120.
 * 기대값은 이 코드베이스의 어떤 계산 구현도 사용하지 않고
 * docs/16_GOLDEN_FIXTURES.md에서 손으로 계산해 상수로 옮긴 것이다.
 * M4 시뮬레이션 엔진은 이 기대값과 일치해야 한다.
 */

const DAY_MS = 86_400_000;
/** 2024-01-01T00:00:00Z */
const FIRST_OPEN_UTC_MS = 1_704_067_200_000;

export const GOLDEN_INSTRUMENT: Instrument = {
  id: "golden-alpha",
  symbol: "ALPHA",
  displayName: "Golden Fixture Alpha",
  assetClass: "crypto",
  market: "FIXTURE",
  quoteCurrency: "USD",
  exchangeTimezone: "UTC",
  providerId: "golden-fixture",
  providerSymbol: "ALPHAUSD",
  status: "active",
};

interface GoldenDay {
  readonly tradingDate: TradingDate;
  readonly open: DecimalString;
  readonly high: DecimalString;
  readonly low: DecimalString;
  readonly close: DecimalString;
}

// 시가는 전일 종가와 같고, 고가·저가는 시가·종가의 최대·최소로 둔다.
const GOLDEN_DAYS: readonly GoldenDay[] = [
  { tradingDate: "2024-01-01", open: "100", high: "100", low: "100", close: "100" },
  { tradingDate: "2024-01-02", open: "100", high: "110", low: "100", close: "110" },
  { tradingDate: "2024-01-03", open: "110", high: "110", low: "90", close: "90" },
  { tradingDate: "2024-01-04", open: "90", high: "120", low: "90", close: "120" },
  { tradingDate: "2024-01-05", open: "120", high: "120", low: "120", close: "120" },
];

export const GOLDEN_CANDLES: readonly Candle[] = GOLDEN_DAYS.map((day, index) => ({
  instrumentId: GOLDEN_INSTRUMENT.id,
  interval: "1d",
  openTimeUtcMs: FIRST_OPEN_UTC_MS + index * DAY_MS,
  closeTimeUtcMs: FIRST_OPEN_UTC_MS + (index + 1) * DAY_MS,
  tradingDate: day.tradingDate,
  open: day.open,
  high: day.high,
  low: day.low,
  close: day.close,
  volume: "1000",
  quoteCurrency: GOLDEN_INSTRUMENT.quoteCurrency,
  source: {
    providerId: GOLDEN_INSTRUMENT.providerId,
    providerSymbol: GOLDEN_INSTRUMENT.providerSymbol,
    fetchedAtUtcMs: FIRST_OPEN_UTC_MS + 5 * DAY_MS,
    priceBasis: "raw",
    dataVersion: "golden-fixture-v1",
  },
}));

/**
 * 일시투자 시나리오의 독립 기대값. 원금 1,000 USD, 수수료 0, 첫 거래일 종가 체결,
 * 소수점 매수 허용. 계산 근거는 docs/16_GOLDEN_FIXTURES.md.
 *
 * 비율(returnRate, drawdownRate)은 무한소수를 피하려고 소수 10자리
 * ROUND_HALF_UP으로 표기한다. 3일차 낙폭의 정확한 값은 2/11이다.
 */
export const GOLDEN_LUMP_SUM_EXPECTED = {
  initialCash: "1000",
  feeRate: "0",
  buyTradingDate: "2024-01-01" as TradingDate,
  executionPrice: "100",
  quantity: "10",
  remainingCash: "0",
  rateDecimalPlaces: 10,
  rateRounding: "half-up",
  days: [
    { date: "2024-01-01", totalValue: "1000", profitLoss: "0", returnRate: "0", drawdownRate: "0" },
    {
      date: "2024-01-02",
      totalValue: "1100",
      profitLoss: "100",
      returnRate: "0.1",
      drawdownRate: "0",
    },
    {
      date: "2024-01-03",
      totalValue: "900",
      profitLoss: "-100",
      returnRate: "-0.1",
      // 정확한 값 2/11 = 0.181818…을 10자리로 반올림
      drawdownRate: "0.1818181818",
    },
    {
      date: "2024-01-04",
      totalValue: "1200",
      profitLoss: "200",
      returnRate: "0.2",
      drawdownRate: "0",
    },
    {
      date: "2024-01-05",
      totalValue: "1200",
      profitLoss: "200",
      returnRate: "0.2",
      drawdownRate: "0",
    },
  ],
  /** 최대 낙폭. 정확한 값은 2/11 (총자산 기준, docs/05 §7·OQ-007 참조) */
  maxDrawdownRate: "0.1818181818",
} as const;

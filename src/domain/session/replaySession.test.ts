import { describe, expect, it } from "vitest";

import type { Candle } from "../market-data/candle";
import { buildReplayDataset } from "../replay/replayDataset";
import { DomainValidationError } from "../shared/errors";
import { assertValidSessionName, extractDataVersions } from "./replaySession";

const DAY_MS = 86_400_000;
const JAN_1 = Date.UTC(2024, 0, 1);

function makeCandle(instrumentId: string, dayOffset: number, dataVersion?: string): Candle {
  const openTimeUtcMs = JAN_1 + dayOffset * DAY_MS;
  return {
    instrumentId,
    interval: "1d",
    openTimeUtcMs,
    closeTimeUtcMs: openTimeUtcMs + DAY_MS - 1,
    tradingDate: new Date(openTimeUtcMs).toISOString().slice(0, 10),
    open: "100",
    high: "110",
    low: "90",
    close: "105",
    quoteCurrency: "USDT",
    source: {
      providerId: "binance",
      providerSymbol: instrumentId,
      fetchedAtUtcMs: JAN_1,
      priceBasis: "raw",
      dataVersion,
    },
  };
}

describe("assertValidSessionName", () => {
  it("정상 이름은 통과한다", () => {
    expect(() => assertValidSessionName("BTC 2024 상반기 DCA")).not.toThrow();
  });

  it("빈 이름(공백만)은 거부한다", () => {
    expect(() => assertValidSessionName("   ")).toThrow(DomainValidationError);
  });

  it("100자를 넘으면 거부한다", () => {
    expect(() => assertValidSessionName("a".repeat(101))).toThrow(DomainValidationError);
  });

  it("정확히 100자는 허용한다 (경계)", () => {
    expect(() => assertValidSessionName("a".repeat(100))).not.toThrow();
  });
});

describe("extractDataVersions", () => {
  it("자산별 마지막 캔들의 dataVersion을 뽑는다", () => {
    const dataset = buildReplayDataset(
      [
        {
          instrumentId: "crypto-btc-usdt",
          candles: [makeCandle("crypto-btc-usdt", 0, "v1"), makeCandle("crypto-btc-usdt", 1, "v2")],
        },
      ],
      { interval: "1d" },
    );

    expect(extractDataVersions(dataset)).toEqual({ "crypto-btc-usdt": "v2" });
  });

  it("dataVersion이 없는 공급자는 null로 기록한다 (오류 아님)", () => {
    const dataset = buildReplayDataset(
      [{ instrumentId: "crypto-eth-usdt", candles: [makeCandle("crypto-eth-usdt", 0)] }],
      { interval: "1d" },
    );

    expect(extractDataVersions(dataset)).toEqual({ "crypto-eth-usdt": null });
  });

  it("캔들이 없는 자산은 null이다 (경계)", () => {
    const dataset = buildReplayDataset([{ instrumentId: "crypto-sol-usdt", candles: [] }], {
      interval: "1d",
    });

    expect(extractDataVersions(dataset)).toEqual({ "crypto-sol-usdt": null });
  });
});

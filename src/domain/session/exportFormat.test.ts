import { describe, expect, it } from "vitest";

import type { PortfolioSnapshot, SimulationAssumptions } from "../simulation/simulationEngine";
import { METRIC_LABELS } from "../simulation/simulationEngine";
import type { SavedSessionConfiguration } from "./replaySession";
import {
  buildPortfolioCsv,
  buildSessionExportPayload,
  serializeSessionExportPayload,
  type PortfolioCsvAssetInput,
} from "./exportFormat";

const ASSUMPTIONS: SimulationAssumptions = {
  executionPrice: "close",
  feeRate: "0.001",
  allowFractionalQuantity: true,
  dividendPolicy: "ignore",
  taxIncluded: false,
  slippageIncluded: false,
  returnRateLabel: METRIC_LABELS.returnRate,
  maxDrawdownPriceLabel: METRIC_LABELS.maxDrawdownPrice,
  maxDrawdownTotalValueLabel: METRIC_LABELS.maxDrawdownTotalValue,
};

function snapshot(date: string, totalValue: string): PortfolioSnapshot {
  return {
    date,
    contributedCapital: { amount: "1000", currency: "USDT" },
    cash: { amount: "0", currency: "USDT" },
    positionQuantity: "10",
    marketValue: { amount: totalValue, currency: "USDT" },
    totalValue: { amount: totalValue, currency: "USDT" },
    profitLoss: { amount: "0", currency: "USDT" },
    returnRate: "0",
    drawdownRate: "0",
    priceStatus: "fresh",
  };
}

const CONFIGURATION: SavedSessionConfiguration = {
  assets: [
    {
      instrumentId: "crypto-btc-usdt",
      providerId: "binance",
      providerSymbol: "BTCUSDT",
      simulationConfig: {
        mode: "lump-sum",
        initialCash: { amount: "1000", currency: "USDT" },
        executionPrice: "close",
        feeRate: "0",
        allowFractionalQuantity: true,
        dividendPolicy: "ignore",
      },
    },
  ],
  interval: "1d",
  range: { startMs: 0, endMs: 86_400_000 },
  displayMode: "raw",
  replaySpeed: 1,
};

describe("buildSessionExportPayload / serializeSessionExportPayload", () => {
  it("구성·데이터 버전을 그대로 보존해 JSON으로 직렬화한다", () => {
    const payload = buildSessionExportPayload(1_000, {
      schemaVersion: 1,
      name: "테스트 세션",
      configuration: CONFIGURATION,
      dataVersions: { "crypto-btc-usdt": "v1" },
    });
    const json = serializeSessionExportPayload(payload);
    const parsed = JSON.parse(json) as typeof payload;

    expect(parsed.exportedAtUtcMs).toBe(1_000);
    expect(parsed.name).toBe("테스트 세션");
    expect(parsed.configuration).toEqual(CONFIGURATION);
    expect(parsed.dataVersions).toEqual({ "crypto-btc-usdt": "v1" });
  });
});

describe("buildPortfolioCsv", () => {
  function assetInput(overrides: Partial<PortfolioCsvAssetInput["header"]> = {}) {
    return {
      header: {
        instrumentId: "crypto-btc-usdt",
        label: "Bitcoin (BTC/USDT)",
        providerId: "binance",
        providerSymbol: "BTCUSDT",
        quoteCurrency: "USDT" as const,
        assumptions: ASSUMPTIONS,
        ...overrides,
      },
      snapshots: [snapshot("2024-01-01", "1000"), snapshot("2024-01-02", "1050")],
    };
  }

  it("헤더 주석, 컬럼, 자산별 데이터 행을 포함한다", () => {
    const csv = buildPortfolioCsv(2_000, [assetInput()]);
    const lines = csv.trim().split("\n");

    expect(lines[0]).toBe("# Chart Reminder portfolio export");
    expect(lines).toContain(
      "instrumentId,date,contributedCapital,cash,marketValue,totalValue,profitLoss,returnRate,drawdownRate,priceStatus",
    );
    expect(lines.some((line) => line.startsWith("# asset: Bitcoin"))).toBe(true);
    expect(lines).toContain("crypto-btc-usdt,2024-01-01,1000,0,1000,1000,0,0,0,fresh");
    expect(lines).toContain("crypto-btc-usdt,2024-01-02,1000,0,1050,1050,0,0,0,fresh");
  });

  it("여러 자산은 각자의 헤더 주석과 데이터 행 블록으로 이어붙는다", () => {
    const second = assetInput({ instrumentId: "crypto-eth-usdt", label: "Ethereum (ETH/USDT)" });
    const csv = buildPortfolioCsv(2_000, [assetInput(), second]);

    expect(csv.indexOf("# asset: Bitcoin")).toBeLessThan(csv.indexOf("# asset: Ethereum"));
    expect(csv).toContain("crypto-eth-usdt,2024-01-01,1000,0,1000,1000,0,0,0,fresh");
  });

  it("자산이 비어 있으면 헤더만 남는다 (경계)", () => {
    const csv = buildPortfolioCsv(2_000, []);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3);
  });
});

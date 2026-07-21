import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AppComposition } from "../../app/composition";
import type {
  ExportFileRequest,
  ExportFileResult,
  FileExporter,
} from "../../application/ports/fileExporter";
import type { CandleRepository } from "../../application/ports/candleRepository";
import type { MarketDataProvider } from "../../application/ports/marketDataProvider";
import type { PrepareReplaySessionRequest } from "../../application/use-cases/prepareReplaySession";
import type { Instrument } from "../../domain/instrument/instrument";
import { buildReplayDataset, type ReplayDataset } from "../../domain/replay/replayDataset";
import { ReplayEngine } from "../../domain/replay/replayEngine";
import { METRIC_LABELS, type SimulationResult } from "../../domain/simulation/simulationEngine";
import type { FxRateProvider } from "../../application/ports/fxRateProvider";
import { InMemoryAppSettingsStore } from "../../infrastructure/persistence/inMemoryAppSettingsStore";
import { InMemorySessionRepository } from "../../infrastructure/persistence/inMemorySessionRepository";
import { InMemoryApiKeyStore } from "../../infrastructure/security/inMemoryApiKeyStore";
import { FakeReplayScheduler } from "../../test/fakeReplayScheduler";
import { SessionActions } from "./SessionActions";

const BTC: Instrument = {
  id: "crypto-btc-usdt",
  symbol: "BTC/USDT",
  displayName: "Bitcoin",
  assetClass: "crypto",
  market: "BINANCE",
  quoteCurrency: "USDT",
  exchangeTimezone: "UTC",
  providerId: "binance",
  providerSymbol: "BTCUSDT",
  status: "active",
};

const request: PrepareReplaySessionRequest = {
  selections: [
    {
      instrument: BTC,
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
  range: { startMs: 0, endMs: 86_400_000 },
};

const dataset: ReplayDataset = buildReplayDataset(
  [
    {
      instrumentId: BTC.id,
      candles: [
        {
          instrumentId: BTC.id,
          interval: "1d",
          openTimeUtcMs: 0,
          closeTimeUtcMs: 86_400_000 - 1,
          tradingDate: "2024-01-01",
          open: "100",
          high: "100",
          low: "100",
          close: "100",
          quoteCurrency: "USDT",
          source: {
            providerId: "binance",
            providerSymbol: "BTCUSDT",
            fetchedAtUtcMs: 0,
            priceBasis: "raw",
            dataVersion: "v1",
          },
        },
      ],
    },
  ],
  { interval: "1d" },
);

const result: SimulationResult = {
  snapshots: [
    {
      date: "2024-01-01",
      contributedCapital: { amount: "1000", currency: "USDT" },
      cash: { amount: "0", currency: "USDT" },
      positionQuantity: "10",
      marketValue: { amount: "1000", currency: "USDT" },
      totalValue: { amount: "1000", currency: "USDT" },
      profitLoss: { amount: "0", currency: "USDT" },
      returnRate: "0",
      drawdownRate: "0",
      priceStatus: "fresh",
    },
  ],
  trades: [],
  metrics: { finalReturnRate: "0", maxDrawdownPrice: "0", maxDrawdownTotalValue: "0" },
  assumptions: {
    executionPrice: "close",
    feeRate: "0",
    allowFractionalQuantity: true,
    dividendPolicy: "ignore",
    taxIncluded: false,
    slippageIncluded: false,
    returnRateLabel: METRIC_LABELS.returnRate,
    maxDrawdownPriceLabel: METRIC_LABELS.maxDrawdownPrice,
    maxDrawdownTotalValueLabel: METRIC_LABELS.maxDrawdownTotalValue,
  },
};

class FakeFileExporter implements FileExporter {
  readonly calls: ExportFileRequest[] = [];
  exportTextFile(exportRequest: ExportFileRequest): Promise<ExportFileResult> {
    this.calls.push(exportRequest);
    return Promise.resolve({ status: "saved", path: "C:/fake/path" });
  }
}

const unusedProvider: MarketDataProvider = {
  id: "unused",
  searchInstruments: () => Promise.reject(new Error("not used by SessionActions")),
  getCandles: () => Promise.reject(new Error("not used by SessionActions")),
};

const unusedRepository: CandleRepository = {
  findRange: () => Promise.reject(new Error("not used by SessionActions")),
  upsertBatch: () => Promise.reject(new Error("not used by SessionActions")),
};

function buildComposition(
  fileExporter: FileExporter,
  sessionRepository = new InMemorySessionRepository(),
): AppComposition {
  return {
    providers: new Map([[unusedProvider.id, unusedProvider]]),
    repository: unusedRepository,
    sessionRepository,
    fileExporter,
    apiKeyStore: new InMemoryApiKeyStore(),
    envManagedProviderIds: new Set(),
    fxRateProvider: {
      getUsdKrwRate: () => Promise.reject(new Error("not used")),
    } as FxRateProvider,
    appSettingsStore: new InMemoryAppSettingsStore(),
    runtime: "browser-preview",
    buildReplayEngine: () => new ReplayEngine({ scheduler: new FakeReplayScheduler() }),
    setApiKey: () => Promise.reject(new Error("not used by SessionActions")),
    clearApiKey: () => Promise.reject(new Error("not used by SessionActions")),
  };
}

function renderActions(composition: AppComposition, speed: 1 | 2 = 1) {
  render(
    <SessionActions
      composition={composition}
      request={request}
      instrumentsById={{ [BTC.id]: BTC }}
      displayMode="raw"
      speed={speed}
      dataset={dataset}
      resultsByInstrumentId={{ [BTC.id]: result }}
      cursor={0}
    />,
  );
}

describe("SessionActions", () => {
  it("이름이 비어 있으면 저장 버튼이 비활성화된다", () => {
    renderActions(buildComposition(new FakeFileExporter()));
    expect(screen.getByRole("button", { name: "세션 저장" })).toBeDisabled();
  });

  it("이름을 입력하고 저장하면 세션 저장소에 기록되고 성공 메시지가 뜬다", async () => {
    const sessionRepository = new InMemorySessionRepository();
    renderActions(buildComposition(new FakeFileExporter(), sessionRepository), 2);

    fireEvent.change(screen.getByLabelText("세션 이름"), { target: { value: "내 세션" } });
    fireEvent.click(screen.getByRole("button", { name: "세션 저장" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("내 세션"));
    const summaries = await sessionRepository.listSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe("내 세션");
  });

  it("세션 JSON 내보내기를 누르면 fileExporter가 json 확장자로 호출된다", async () => {
    const exporter = new FakeFileExporter();
    renderActions(buildComposition(exporter));

    fireEvent.click(screen.getByRole("button", { name: "세션 JSON 내보내기" }));
    await waitFor(() => expect(exporter.calls).toHaveLength(1));
    expect(exporter.calls[0].extension).toBe("json");
    expect(JSON.parse(exporter.calls[0].content).configuration.assets[0].instrumentId).toBe(BTC.id);
  });

  it("포트폴리오 CSV 내보내기를 누르면 fileExporter가 csv 확장자로 호출된다", async () => {
    const exporter = new FakeFileExporter();
    renderActions(buildComposition(exporter));

    fireEvent.click(screen.getByRole("button", { name: "포트폴리오 CSV 내보내기" }));
    await waitFor(() => expect(exporter.calls).toHaveLength(1));
    expect(exporter.calls[0].extension).toBe("csv");
    expect(exporter.calls[0].content).toContain("crypto-btc-usdt,2024-01-01");
  });
});

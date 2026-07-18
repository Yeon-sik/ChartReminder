import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppComposition } from "../../app/composition";
import type {
  CandleQuery,
  MarketDataProvider,
  ProviderCandleBatch,
} from "../../application/ports/marketDataProvider";
import type { PrepareReplaySessionRequest } from "../../application/use-cases/prepareReplaySession";
import type { Instrument } from "../../domain/instrument/instrument";
import type { Candle } from "../../domain/market-data/candle";
import { ReplayEngine } from "../../domain/replay/replayEngine";
import { browserFileExporter } from "../../infrastructure/export/browserFileExporter";
import { InMemoryCandleRepository } from "../../infrastructure/persistence/inMemoryCandleRepository";
import { InMemorySessionRepository } from "../../infrastructure/persistence/inMemorySessionRepository";
import { InMemoryApiKeyStore } from "../../infrastructure/security/inMemoryApiKeyStore";
import { FakeReplayScheduler } from "../../test/fakeReplayScheduler";
import { ReplayWorkspace } from "./ReplayWorkspace";

vi.mock("lightweight-charts", () => ({
  LineSeries: "LineSeriesDefinition",
  LineStyle: { Solid: 0, Dashed: 2 },
  createChart: () => ({
    addSeries: () => ({ setData: () => {} }),
    removeSeries: () => {},
    remove: () => {},
    applyOptions: () => {},
  }),
}));

const DAY_MS = 86_400_000;
const RANGE_START = Date.UTC(2024, 0, 1);
const RANGE_END = Date.UTC(2024, 0, 4); // 1/1, 1/2, 1/3

const BTC: Instrument = {
  id: "crypto-btc-usdt",
  symbol: "BTC/USDT",
  displayName: "Bitcoin",
  assetClass: "crypto",
  market: "BINANCE",
  quoteCurrency: "USDT",
  exchangeTimezone: "UTC",
  providerId: "fake",
  providerSymbol: "BTCUSDT",
  status: "active",
};

const CLOSE_BY_DAY = ["100", "110", "120"];

class FakeProvider implements MarketDataProvider {
  readonly id = "fake";

  searchInstruments(): Promise<Instrument[]> {
    return Promise.resolve([]);
  }

  getCandles(query: CandleQuery): Promise<ProviderCandleBatch> {
    const candles: Candle[] = [];
    for (let ms = query.range.startMs; ms < query.range.endMs; ms += DAY_MS) {
      const dayIndex = (ms - RANGE_START) / DAY_MS;
      const close = CLOSE_BY_DAY[dayIndex];
      candles.push({
        instrumentId: query.instrument.id,
        interval: "1d",
        openTimeUtcMs: ms,
        closeTimeUtcMs: ms + DAY_MS - 1,
        tradingDate: new Date(ms).toISOString().slice(0, 10),
        open: close,
        high: close,
        low: close,
        close,
        quoteCurrency: "USDT",
        source: {
          providerId: "fake",
          providerSymbol: "BTCUSDT",
          fetchedAtUtcMs: RANGE_END,
          priceBasis: "raw",
        },
      });
    }
    return Promise.resolve({
      providerId: this.id,
      candles,
      requestedRange: query.range,
      completeRange: query.range,
      fetchedAtUtcMs: RANGE_END,
    });
  }
}

function buildComposition(): AppComposition {
  const provider = new FakeProvider();
  return {
    providers: new Map([[provider.id, provider]]),
    repository: new InMemoryCandleRepository(),
    sessionRepository: new InMemorySessionRepository(),
    fileExporter: browserFileExporter,
    apiKeyStore: new InMemoryApiKeyStore(),
    runtime: "browser-preview",
    buildReplayEngine: () => new ReplayEngine({ scheduler: new FakeReplayScheduler() }),
    setApiKey: () => Promise.reject(new Error("not used")),
    clearApiKey: () => Promise.reject(new Error("not used")),
  };
}

function buildRequest(): PrepareReplaySessionRequest {
  return {
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
    range: { startMs: RANGE_START, endMs: RANGE_END },
  };
}

describe("ReplayWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("로딩 → 준비 완료로 전환되고 첫날 결과를 보여준다", async () => {
    render(
      <ReplayWorkspace
        composition={buildComposition()}
        request={buildRequest()}
        instrumentsById={{ [BTC.id]: BTC }}
        displayMode="raw"
        onBackToSetup={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("조회하는 중");

    await screen.findByText("재생 준비 완료 · 2024-01-01");

    expect(screen.getByText("Bitcoin (BTC/USDT)")).toBeInTheDocument();
    // 1000 USDT로 종가 100에 매수 → 1000.00 USDT 평가액
    expect(screen.getAllByText("1000.00 USDT")).not.toHaveLength(0);
  });

  it("한 단계 전진하면 다음 날짜의 결과로 갱신된다 (미래 데이터는 그 전까지 보이지 않음)", async () => {
    render(
      <ReplayWorkspace
        composition={buildComposition()}
        request={buildRequest()}
        instrumentsById={{ [BTC.id]: BTC }}
        displayMode="raw"
        onBackToSetup={vi.fn()}
      />,
    );

    await screen.findByText("재생 준비 완료 · 2024-01-01");
    // 3일차(120) 평가액이 아직 보이지 않아야 한다
    expect(screen.queryByText("1200.00 USDT")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "한 단계 전진" }));

    await screen.findByText("일시정지 · 2024-01-02");
    // 종가 110 → 평가액 1100
    expect(screen.getAllByText("1100.00 USDT")).not.toHaveLength(0);
    expect(screen.queryByText("1200.00 USDT")).not.toBeInTheDocument();
  });
});

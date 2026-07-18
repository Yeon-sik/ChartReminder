import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AppComposition } from "../../app/composition";
import type { CandleRepository } from "../../application/ports/candleRepository";
import type { FileExporter } from "../../application/ports/fileExporter";
import type { MarketDataProvider } from "../../application/ports/marketDataProvider";
import type { Instrument } from "../../domain/instrument/instrument";
import type { ReplaySessionRecord } from "../../domain/session/replaySession";
import { ReplayEngine } from "../../domain/replay/replayEngine";
import { InMemorySessionRepository } from "../../infrastructure/persistence/inMemorySessionRepository";
import { BINANCE_INSTRUMENTS } from "../../infrastructure/providers/binance/binanceCatalog";
import { InMemoryApiKeyStore } from "../../infrastructure/security/inMemoryApiKeyStore";
import { FakeReplayScheduler } from "../../test/fakeReplayScheduler";
import { SavedSessionsPanel } from "./SavedSessionsPanel";

const BTC = BINANCE_INSTRUMENTS[0];
const CATALOG = Object.fromEntries(BINANCE_INSTRUMENTS.map((i) => [i.id, i])) as Record<
  string,
  Instrument
>;

const unusedProvider: MarketDataProvider = {
  id: "unused",
  searchInstruments: () => Promise.reject(new Error("not used")),
  getCandles: () => Promise.reject(new Error("not used")),
};

const unusedRepository: CandleRepository = {
  findRange: () => Promise.reject(new Error("not used")),
  upsertBatch: () => Promise.reject(new Error("not used")),
};

const unusedFileExporter: FileExporter = {
  exportTextFile: () => Promise.reject(new Error("not used")),
};

function buildComposition(sessionRepository: InMemorySessionRepository): AppComposition {
  return {
    providers: new Map([[unusedProvider.id, unusedProvider]]),
    repository: unusedRepository,
    sessionRepository,
    fileExporter: unusedFileExporter,
    apiKeyStore: new InMemoryApiKeyStore(),
    runtime: "browser-preview",
    buildReplayEngine: () => new ReplayEngine({ scheduler: new FakeReplayScheduler() }),
    setApiKey: () => Promise.reject(new Error("not used")),
    clearApiKey: () => Promise.reject(new Error("not used")),
  };
}

function makeRecord(overrides: Partial<ReplaySessionRecord> = {}): ReplaySessionRecord {
  return {
    id: "session-1",
    name: "저장된 세션",
    schemaVersion: 1,
    configuration: {
      assets: [
        {
          instrumentId: BTC.id,
          providerId: BTC.providerId,
          providerSymbol: BTC.providerSymbol,
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
    },
    dataVersions: {},
    createdAtUtcMs: 0,
    updatedAtUtcMs: 0,
    ...overrides,
  };
}

describe("SavedSessionsPanel", () => {
  it("저장된 세션이 없으면 아무것도 렌더링하지 않는다", async () => {
    const { container } = render(
      <SavedSessionsPanel
        composition={buildComposition(new InMemorySessionRepository())}
        instrumentCatalogById={CATALOG}
        onLoad={vi.fn()}
      />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("저장된 세션 목록을 보여주고 불러오기를 누르면 onLoad가 호출된다", async () => {
    const sessionRepository = new InMemorySessionRepository();
    await sessionRepository.save(makeRecord());
    const onLoad = vi.fn();

    render(
      <SavedSessionsPanel
        composition={buildComposition(sessionRepository)}
        instrumentCatalogById={CATALOG}
        onLoad={onLoad}
      />,
    );

    expect(await screen.findByRole("button", { name: "불러오기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "불러오기" }));

    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
    const restored = onLoad.mock.calls[0][0];
    expect(restored.instrumentsById[BTC.id]).toBe(BTC);
    expect(restored.replaySpeed).toBe(1);
  });

  it("카탈로그에 없는 자산이면 오류 메시지를 보여준다", async () => {
    const sessionRepository = new InMemorySessionRepository();
    await sessionRepository.save(
      makeRecord({
        configuration: {
          assets: [
            {
              instrumentId: "crypto-doge-usdt",
              providerId: "binance",
              providerSymbol: "DOGEUSDT",
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
        },
      }),
    );

    render(
      <SavedSessionsPanel
        composition={buildComposition(sessionRepository)}
        instrumentCatalogById={CATALOG}
        onLoad={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "불러오기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/찾을 수 없습니다/);
  });
});

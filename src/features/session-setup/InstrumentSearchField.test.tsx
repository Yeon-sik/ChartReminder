import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { InstrumentSearchResult } from "../../application/use-cases/searchInstruments";
import type { Instrument } from "../../domain/instrument/instrument";
import { InstrumentSearchField } from "./InstrumentSearchField";

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

const AAPL: Instrument = {
  id: "stock-aapl",
  symbol: "AAPL",
  displayName: "Apple Inc.",
  assetClass: "stock",
  market: "US",
  quoteCurrency: "USD",
  exchangeTimezone: "America/New_York",
  providerId: "tiingo",
  providerSymbol: "aapl",
  status: "active",
};

function ok(instruments: Instrument[]): Promise<InstrumentSearchResult> {
  return Promise.resolve({ instruments, errorsByProviderId: {} });
}

describe("InstrumentSearchField", () => {
  it("현재 선택된 자산의 표시명을 입력값으로 보여준다", () => {
    render(
      <InstrumentSearchField
        label="자산 1"
        selected={BTC}
        excludeIds={new Set()}
        search={() => ok([])}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("자산 1")).toHaveValue("Bitcoin (BTC/USDT)");
  });

  it("포커스하면 빈 질의로 검색해 기본 추천을 보여준다", async () => {
    const search = vi.fn(() => ok([AAPL]));
    render(
      <InstrumentSearchField
        label="자산 1"
        selected={BTC}
        excludeIds={new Set()}
        search={search}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByLabelText("자산 1"));

    await waitFor(() => expect(search).toHaveBeenCalledWith(""));
    expect(await screen.findByRole("button", { name: "Apple Inc. (AAPL)" })).toBeInTheDocument();
  });

  it("결과를 클릭하면 onSelect가 호출되고 입력창이 선택값으로 되돌아간다", async () => {
    const onSelect = vi.fn();
    render(
      <InstrumentSearchField
        label="자산 1"
        selected={BTC}
        excludeIds={new Set()}
        search={() => ok([AAPL])}
        onSelect={onSelect}
      />,
    );

    fireEvent.focus(screen.getByLabelText("자산 1"));
    fireEvent.click(await screen.findByRole("button", { name: "Apple Inc. (AAPL)" }));

    expect(onSelect).toHaveBeenCalledWith(AAPL);
  });

  it("excludeIds에 있는 자산은 결과에서 제외한다", async () => {
    render(
      <InstrumentSearchField
        label="자산 2"
        selected={AAPL}
        excludeIds={new Set([AAPL.id])}
        search={() => ok([AAPL, BTC])}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByLabelText("자산 2"));

    expect(await screen.findByRole("button", { name: "Bitcoin (BTC/USDT)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apple Inc. (AAPL)" })).not.toBeInTheDocument();
  });

  it("검색 오류는 alert로 보여준다", async () => {
    const search = () =>
      Promise.resolve({
        instruments: [],
        errorsByProviderId: { tiingo: new Error("network fail") },
      });
    render(
      <InstrumentSearchField
        label="자산 1"
        selected={BTC}
        excludeIds={new Set()}
        search={search}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByLabelText("자산 1"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
